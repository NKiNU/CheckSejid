// Phase 06 (ADR-021) integration tests against a real PostgreSQL.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { createTenant, createUser, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";
import { activeTenant, addMember, as, resetStores, setOrgStatus } from "../../test/fixtures.ts";
import { getObjectBytes } from "../../storage.ts";
import { FILES, startS3 } from "../../test/s3.ts";
import { GPS, jpegWithGps, pngPlain, webpWithGps } from "../../test/images.ts";
import { publicRateLimitStores } from "../public/public.routes.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { hubRateLimitStores } from "./hub.routes.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("hub.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

type Who = { token: string };
const base = (t: Pick<TestTenant, "organisationId">, kind: "posts" | "events") => `/orgs/${t.organisationId}/hub/${kind}`;
const createPost = (t: TestTenant, who: Who = t, body: object = { title: "Gotong-royong", body: "Saturday 8am" }) =>
  request(app).post(base(t, "posts")).set(as(who)).send(body);
const hour = 60 * 60 * 1000;
const eventBody = (startOffsetH = 24, durationH = 2, extra: object = {}) => ({
  title: "Ceramah Maulid",
  description: "After Isyak",
  startsAt: new Date(Date.now() + startOffsetH * hour).toISOString(),
  endsAt: new Date(Date.now() + (startOffsetH + durationH) * hour).toISOString(),
  location: "Main hall",
  ...extra,
});
const act = (t: TestTenant, kind: "posts" | "events", id: string, action: string, who: Who = t) =>
  request(app).post(`${base(t, kind)}/${id}/${action}`).set(as(who));

describe.skipIf(!hasDb)("information hub (database)", () => {
  let stopS3: () => Promise<void>;
  beforeAll(async () => {
    stopS3 = await startS3();
  });
  beforeEach(() => resetStores(tenancyRateLimitStores, rbacRateLimitStores, publicRateLimitStores, hubRateLimitStores));
  afterAll(async () => {
    await stopS3();
    await prisma.$disconnect();
  });

  describe("lifecycle and permissions (HUB-002/003, ADR-021 §3)", () => {
    it("DRAFT → PUBLISHED → ARCHIVED → PUBLISHED; only drafts are edited or deleted; others 409", async () => {
      const t = await activeTenant();
      const staff = await addMember(t, ["staff"]); // bulletin.manage, not bulletin.publish
      const committee = await addMember(t, ["committee"]);
      const created = await createPost(t, staff).expect(201);
      const id = created.body.post.id;
      expect(created.body.post).toMatchObject({ status: "DRAFT", publishedAt: null, createdById: staff.userId });
      expect(created.body.post).not.toHaveProperty("organisationId");

      await request(app).patch(`${base(t, "posts")}/${id}`).set(as(staff)).send({ title: "Gotong-royong (updated)" }).expect(200);
      const denied = await act(t, "posts", id, "publish", staff);
      expect([denied.status, denied.body.error.code]).toEqual([403, "FORBIDDEN"]);
      const archiveDraft = await act(t, "posts", id, "archive", committee);
      expect([archiveDraft.status, archiveDraft.body.error.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);

      const published = await act(t, "posts", id, "publish", committee).expect(200);
      expect(published.body.post).toMatchObject({ status: "PUBLISHED", title: "Gotong-royong (updated)" });
      expect(published.body.post.publishedAt).not.toBeNull();
      expect((await act(t, "posts", id, "publish", committee)).status).toBe(409); // already published
      const edit = await request(app).patch(`${base(t, "posts")}/${id}`).set(as(staff)).send({ title: "x" });
      expect([edit.status, edit.body.error.code]).toEqual([409, "NOT_EDITABLE"]);
      expect((await request(app).delete(`${base(t, "posts")}/${id}`).set(as(staff))).status).toBe(409);

      await act(t, "posts", id, "archive", committee).expect(200);
      const republished = await act(t, "posts", id, "publish", committee).expect(200); // ADR-021 republish
      expect(republished.body.post.status).toBe("PUBLISHED");

      const draft = (await createPost(t, staff).expect(201)).body.post.id;
      await request(app).delete(`${base(t, "posts")}/${draft}`).set(as(staff)).expect(204);
      expect(await prisma.post.count({ where: { id: draft } })).toBe(0);
    });

    it("drafts are visible only with the *.manage key; members without it see published/archived", async () => {
      const t = await activeTenant();
      const treasurer = await addMember(t, ["treasurer"]); // organisation.read, no hub keys
      const draft = (await createPost(t).expect(201)).body.post.id;
      const live = (await createPost(t).expect(201)).body.post.id;
      await act(t, "posts", live, "publish").expect(200);

      const mine = await request(app).get(base(t, "posts")).set(as(t)).expect(200);
      expect(mine.body.posts.map((p: { id: string }) => p.id).sort()).toEqual([draft, live].sort());
      const theirs = await request(app).get(base(t, "posts")).set(as(treasurer)).expect(200);
      expect(theirs.body.posts.map((p: { id: string }) => p.id)).toEqual([live]);
      expect((await request(app).get(`${base(t, "posts")}?status=DRAFT`).set(as(treasurer))).body.posts).toEqual([]);
      const hidden = await request(app).get(`${base(t, "posts")}/${draft}`).set(as(treasurer));
      expect([hidden.status, hidden.body.error.code]).toEqual([404, "POST_NOT_FOUND"]);
      const create = await createPost(t, treasurer);
      expect([create.status, create.body.error.code]).toEqual([403, "FORBIDDEN"]);
    });

    it("validation: strict bodies, event times, malformed ids", async () => {
      const t = await activeTenant();
      for (const body of [{ title: "" , body: "x" }, { title: "x", body: "x", organisationId: randomUUID() }, { title: "x" }]) {
        expect((await createPost(t, t, body)).body.error.code, JSON.stringify(body)).toBe("VALIDATION_ERROR");
      }
      const backwards = await request(app).post(base(t, "events")).set(as(t)).send(eventBody(24, -1));
      expect([backwards.status, backwards.body.error.code]).toEqual([400, "VALIDATION_ERROR"]);
      expect((await request(app).post(base(t, "events")).set(as(t)).send({ ...eventBody(), startsAt: "tomorrow" })).status).toBe(400);
      const ev = (await request(app).post(base(t, "events")).set(as(t)).send(eventBody()).expect(201)).body.event;
      expect(ev).toMatchObject({ title: "Ceramah Maulid", location: "Main hall", status: "DRAFT" });
      // A patch is checked against the stored times too.
      const patch = await request(app).patch(`${base(t, "events")}/${ev.id}`).set(as(t)).send({ endsAt: new Date(Date.now()).toISOString() });
      expect(patch.body.error.code).toBe("VALIDATION_ERROR");
      expect((await request(app).patch(`${base(t, "events")}/${ev.id}`).set(as(t)).send({})).status).toBe(400);
      const bad = await request(app).get(`${base(t, "events")}/not-a-uuid`).set(as(t));
      expect([bad.status, bad.body.error.code]).toEqual([404, "EVENT_NOT_FOUND"]);
    });
  });

  it("publishing (and republishing) an event notifies every other member (ADR-017, ADR-021 §5)", async () => {
    const t = await activeTenant();
    const staff = await addMember(t, ["staff"]);
    const ev = (await request(app).post(base(t, "events")).set(as(t)).send(eventBody()).expect(201)).body.event;
    await act(t, "events", ev.id, "publish").expect(200);
    const rows = await prisma.notification.findMany({ where: { organisationId: t.organisationId, type: "event.published" } });
    expect(rows.map((r) => [r.recipientUserId, r.title, r.targetType, r.targetId])).toEqual([[staff.userId, "Event published: Ceramah Maulid", "event", ev.id]]);
    await act(t, "events", ev.id, "archive").expect(200);
    await act(t, "events", ev.id, "publish").expect(200);
    expect(await prisma.notification.count({ where: { organisationId: t.organisationId, type: "event.published" } })).toBe(2);
    // Posts do not notify (not an ADR-017 event).
    const post = (await createPost(t).expect(201)).body.post.id;
    await act(t, "posts", post, "publish").expect(200);
    expect(await prisma.notification.count({ where: { organisationId: t.organisationId, targetType: "post" } })).toBe(0);
  });

  describe("public reads respect organisation visibility (HUB-004/005)", () => {
    async function seed(visibility: "PUBLIC" | "UNLISTED" | "PRIVATE") {
      const t = await activeTenant(`Hub ${visibility}`, visibility);
      const live = (await createPost(t).expect(201)).body.post.id;
      await act(t, "posts", live, "publish").expect(200);
      const archived = (await createPost(t).expect(201)).body.post.id;
      await act(t, "posts", archived, "publish").expect(200);
      await act(t, "posts", archived, "archive").expect(200);
      await createPost(t).expect(201); // draft
      const upcoming = (await request(app).post(base(t, "events")).set(as(t)).send(eventBody()).expect(201)).body.event.id;
      await act(t, "events", upcoming, "publish").expect(200);
      const past = (await request(app).post(base(t, "events")).set(as(t)).send(eventBody(-5, 1)).expect(201)).body.event.id;
      await act(t, "events", past, "publish").expect(200);
      return { t, live, upcoming };
    }

    it("PUBLIC: published only, upcoming events only; UNLISTED: logged-in only; PRIVATE: 404", async () => {
      const visitor = await createUser();
      const pub = await seed("PUBLIC");
      const posts = await request(app).get(`/public/orgs/${pub.t.organisationId}/posts`).expect(200);
      expect(posts.body.posts.map((p: { id: string }) => p.id)).toEqual([pub.live]);
      expect(Object.keys(posts.body.posts[0]).sort()).toEqual(["body", "id", "images", "publishedAt", "title"]);
      const events = await request(app).get(`/public/orgs/${pub.t.organisationId}/events`).expect(200);
      expect(events.body.events.map((e: { id: string }) => e.id)).toEqual([pub.upcoming]);

      const unl = await seed("UNLISTED");
      expect((await request(app).get(`/public/orgs/${unl.t.organisationId}/posts`)).body.error.code).toBe("LOGIN_REQUIRED");
      expect((await request(app).get(`/public/orgs/${unl.t.organisationId}/posts`).set(as(visitor)).expect(200)).body.posts).toHaveLength(1);

      const priv = await seed("PRIVATE");
      for (const path of ["posts", "events"]) {
        const r = await request(app).get(`/public/orgs/${priv.t.organisationId}/${path}`).set(as(visitor));
        expect([r.status, r.body.error.code]).toEqual([404, "ORGANISATION_NOT_FOUND"]);
      }
    });

    it("a follower's feed shows published content of followed public organisations only", async () => {
      const u = await createUser();
      const a = await seed("PUBLIC");
      const b = await seed("PUBLIC");
      await request(app).put(`/me/follows/${a.t.organisationId}`).set(as(u)).expect(204);
      await request(app).put(`/me/follows/${b.t.organisationId}`).set(as(u)).expect(204);
      await request(app).patch(`/orgs/${b.t.organisationId}`).set(as(b.t)).send({ visibility: "PRIVATE" }).expect(200);
      const feed = await request(app).get("/me/feed").set(as(u)).expect(200);
      expect(feed.body.posts.map((p: { id: string }) => p.id)).toEqual([a.live]);
      expect(feed.body.posts[0].organisation).toEqual({ id: a.t.organisationId, name: "Hub PUBLIC" });
      expect(feed.body.events.map((e: { id: string }) => e.id)).toEqual([a.upcoming]);
      expect((await request(app).get("/me/feed")).status).toBe(401);
    });
  });

  describe("lifecycle guard (ADR-016 §2) and tenant isolation (TENANT-005)", () => {
    it("module routes need ACTIVE; SUSPENDED/ARCHIVED stay readable but not writable", async () => {
      const onboarding = await createTenant();
      for (const r of [request(app).get(base(onboarding, "posts")), createPost(onboarding)]) {
        const res = await r.set(as(onboarding));
        expect([res.status, res.body.error.code]).toEqual([409, "ORGANISATION_NOT_WRITABLE"]);
      }
      const t = await activeTenant();
      const id = (await createPost(t).expect(201)).body.post.id;
      await setOrgStatus(t, "SUSPENDED");
      await request(app).get(base(t, "posts")).set(as(t)).expect(200);
      expect((await act(t, "posts", id, "publish")).body.error.code).toBe("ORGANISATION_NOT_WRITABLE");
      await setOrgStatus(t, "ARCHIVED");
      await request(app).get(`${base(t, "posts")}/${id}`).set(as(t)).expect(200);
      expect((await createPost(t)).body.error.code).toBe("ORGANISATION_NOT_WRITABLE");
    });

    it("another tenant gets 404 on every hub route, and cannot reach a victim item by id", async () => {
      const victim = await activeTenant();
      const post = (await createPost(victim).expect(201)).body.post.id;
      const ev = (await request(app).post(base(victim, "events")).set(as(victim)).send(eventBody()).expect(201)).body.event.id;
      const attacker = await activeTenant();
      const routes = (org: TestTenant, code?: string) => [
        { method: "get" as const, path: base(org, "posts") },
        { method: "get" as const, path: `${base(org, "posts")}/${post}`, expectedCode: code && "POST_NOT_FOUND" },
        { method: "patch" as const, path: `${base(org, "posts")}/${post}`, body: { title: "pwned" }, expectedCode: code && "POST_NOT_FOUND" },
        { method: "delete" as const, path: `${base(org, "posts")}/${post}`, expectedCode: code && "POST_NOT_FOUND" },
        { method: "post" as const, path: `${base(org, "posts")}/${post}/publish`, expectedCode: code && "POST_NOT_FOUND" },
        { method: "post" as const, path: `${base(org, "events")}/${ev}/publish`, expectedCode: code && "EVENT_NOT_FOUND" },
        { method: "post" as const, path: `${base(org, "events")}/${ev}/archive`, expectedCode: code && "EVENT_NOT_FOUND" },
      ];
      const snapshot = () => prisma.post.findMany({ where: { organisationId: victim.organisationId }, orderBy: { id: "asc" } });
      await expectCrossTenantDenied(attacker, routes(victim), { snapshot });
      // ID guessing under the attacker's own organisation: the module's own not-found code.
      await expectCrossTenantDenied(attacker, routes(attacker, "own").slice(1), { snapshot });
    });
  });

  describe("images on drafts (HUB-007, ADR-033)", () => {
    const upload = (t: TestTenant, kind: "posts" | "events", id: string, body: Buffer, who: Who = t) =>
      request(app).post(`${base(t, kind)}/${id}/images`).set(as(who)).set("Content-Type", "application/octet-stream").send(body);
    const draft = async (t: TestTenant, kind: "posts" | "events") =>
      (kind === "posts" ? (await createPost(t).expect(201)).body.post : (await request(app).post(base(t, kind)).set(as(t)).send(eventBody()).expect(201)).body.event).id as string;
    const item = async (t: TestTenant, kind: "posts" | "events", id: string) =>
      (await request(app).get(`${base(t, kind)}/${id}`).set(as(t)).expect(200)).body[kind === "posts" ? "post" : "event"];
    const keyOf = async (imageId: string) => (await prisma.hubImage.findUniqueOrThrow({ where: { id: imageId } })).objectKey;
    type Img = { id: string; isMain: boolean };

    for (const kind of ["posts", "events"] as const) {
      const one = kind === "posts" ? "post" : "event";
      it(`${kind}: strips metadata, first image is main, set-main and remove keep exactly one main, files follow`, async () => {
        const t = await activeTenant();
        const id = await draft(t, kind);
        expect((await item(t, kind, id)).images).toEqual([]);

        const a = (await upload(t, kind, id, jpegWithGps()).expect(201)).body.image;
        expect(a).toMatchObject({ isMain: true });
        expect(a.url).toMatch(new RegExp(`/public/org/${t.organisationId}/hub/[0-9a-f-]{36}\\.jpg$`));
        const stored = await getObjectBytes(await keyOf(a.id));
        expect(stored.includes(Buffer.from(GPS))).toBe(false);
        expect(stored.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
        const b = (await upload(t, kind, id, pngPlain()).expect(201)).body.image;
        const c = (await upload(t, kind, id, webpWithGps()).expect(201)).body.image;
        expect([b.isMain, c.isMain]).toEqual([false, false]);
        expect((await getObjectBytes(await keyOf(c.id))).includes(Buffer.from(GPS))).toBe(false);
        expect((await item(t, kind, id)).images.map((i: Img) => i.id)).toEqual([a.id, b.id, c.id]);
        expect((await request(app).get(base(t, kind)).set(as(t)).expect(200)).body[kind][0].images).toHaveLength(3);

        const moved = await request(app).post(`${base(t, kind)}/${id}/images/${c.id}/main`).set(as(t)).expect(200);
        expect(moved.body.images.map((i: Img) => [i.id, i.isMain])).toEqual([[a.id, false], [b.id, false], [c.id, true]]);

        const aKey = await keyOf(a.id);
        const cKey = await keyOf(c.id);
        await request(app).delete(`${base(t, kind)}/${id}/images/${c.id}`).set(as(t)).expect(204); // the main one
        await expect(getObjectBytes(cKey)).rejects.toThrow();
        expect((await item(t, kind, id)).images.map((i: Img) => [i.id, i.isMain])).toEqual([[a.id, true], [b.id, false]]); // earliest promoted
        const gone = await request(app).delete(`${base(t, kind)}/${id}/images/${c.id}`).set(as(t));
        expect([gone.status, gone.body.error.code]).toEqual([404, "IMAGE_NOT_FOUND"]);
        expect((await request(app).post(`${base(t, kind)}/${id}/images/not-a-uuid/main`).set(as(t))).body.error.code).toBe("IMAGE_NOT_FOUND");

        const audits = await prisma.auditLog.findMany({ where: { organisationId: t.organisationId, action: { startsWith: `hub.${one}.image.` } } });
        expect(audits.map((x) => x.action).sort()).toEqual(["add", "add", "add", "main", "remove"].map((x) => `hub.${one}.image.${x}`));

        await request(app).delete(`${base(t, kind)}/${id}`).set(as(t)).expect(204); // deleting the draft deletes images and files
        expect(await prisma.hubImage.count({ where: { organisationId: t.organisationId } })).toBe(0);
        await expect(getObjectBytes(aKey)).rejects.toThrow();
      });
    }

    it("at most 5 images, only JPEG/PNG/WebP by content, at most 5 MB", async () => {
      const t = await activeTenant();
      const id = await draft(t, "posts");
      for (let i = 0; i < 5; i++) await upload(t, "posts", id, pngPlain()).expect(201);
      const sixth = await upload(t, "posts", id, pngPlain());
      expect([sixth.status, sixth.body.error.code]).toEqual([409, "TOO_MANY_IMAGES"]);
      expect(await prisma.hubImage.count({ where: { postId: id } })).toBe(5);
      expect((await prisma.hubImage.findMany({ where: { postId: id } })).filter((i) => i.isMain)).toHaveLength(1);

      const other = await draft(t, "posts");
      for (const bad of [FILES.html, FILES.pdf, Buffer.from("ftypheic".padEnd(40, "x"))]) {
        const r = await upload(t, "posts", other, bad);
        expect([r.status, r.body.error.code]).toEqual([415, "UNSUPPORTED_FILE_TYPE"]);
      }
      const big = await upload(t, "posts", other, Buffer.concat([pngPlain(), Buffer.alloc(5 * 1024 * 1024)]));
      expect([big.status, big.body.error.code]).toEqual([413, "FILE_TOO_LARGE"]);
      expect((await upload(t, "posts", other, Buffer.alloc(0))).body.error.code).toBe("FILE_REQUIRED");
      const broken = await upload(t, "posts", other, pngPlain().subarray(0, 30));
      expect([broken.status, broken.body.error.code]).toEqual([400, "INVALID_IMAGE"]);
      expect(await prisma.hubImage.count({ where: { postId: other } })).toBe(0);
    });

    it("needs the item's manage key and an ACTIVE organisation", async () => {
      const t = await activeTenant();
      const treasurer = await addMember(t, ["treasurer"]); // no hub keys
      const staff = await addMember(t, ["staff"]);
      const id = await draft(t, "events");
      const denied = await upload(t, "events", id, pngPlain(), treasurer);
      expect([denied.status, denied.body.error.code]).toEqual([403, "FORBIDDEN"]);
      const img = (await upload(t, "events", id, pngPlain(), staff).expect(201)).body.image.id;
      expect((await request(app).delete(`${base(t, "events")}/${id}/images/${img}`).set(as(treasurer))).status).toBe(403);
      expect((await request(app).post(`${base(t, "events")}/${id}/images/${img}/main`).set(as(treasurer))).status).toBe(403);
      await setOrgStatus(t, "SUSPENDED");
      const suspended = await upload(t, "events", id, pngPlain());
      expect([suspended.status, suspended.body.error.code]).toEqual([409, "ORGANISATION_NOT_WRITABLE"]);
      expect(await prisma.hubImage.count({ where: { eventId: id } })).toBe(1);
    });

    it("images change only while the item is a DRAFT (409 INVALID_STATE_TRANSITION) and show once published", async () => {
      const t = await activeTenant("Hub PUBLIC", "PUBLIC");
      const id = await draft(t, "events");
      const img = (await upload(t, "events", id, pngPlain()).expect(201)).body.image;
      expect((await request(app).get(`/public/orgs/${t.organisationId}/events`).expect(200)).body.events).toEqual([]);
      await act(t, "events", id, "publish").expect(200);
      const live = await request(app).get(`/public/orgs/${t.organisationId}/events`).expect(200);
      expect(live.body.events[0].images).toEqual([img]);
      for (const res of [
        await upload(t, "events", id, pngPlain()),
        await request(app).delete(`${base(t, "events")}/${id}/images/${img.id}`).set(as(t)),
        await request(app).post(`${base(t, "events")}/${id}/images/${img.id}/main`).set(as(t)),
      ]) expect([res.status, res.body.error.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
      expect(await prisma.hubImage.count({ where: { eventId: id } })).toBe(1);
      await act(t, "events", id, "archive").expect(200);
      expect((await request(app).get(`/public/orgs/${t.organisationId}/events`).expect(200)).body.events).toEqual([]);

      const post = await draft(t, "posts");
      const pimg = (await upload(t, "posts", post, pngPlain()).expect(201)).body.image;
      await act(t, "posts", post, "publish").expect(200);
      expect((await request(app).get(`/public/orgs/${t.organisationId}/posts`).expect(200)).body.posts[0].images).toEqual([pimg]);
      const u = await createUser();
      await request(app).put(`/me/follows/${t.organisationId}`).set(as(u)).expect(204);
      expect((await request(app).get("/me/feed").set(as(u)).expect(200)).body.posts[0].images).toEqual([pimg]);
    });

    it("another organisation cannot add, remove or promote our images (TENANT)", async () => {
      const victim = await activeTenant();
      const id = await draft(victim, "posts");
      const img = (await upload(victim, "posts", id, pngPlain()).expect(201)).body.image;
      const second = (await upload(victim, "posts", id, pngPlain()).expect(201)).body.image;
      const attacker = await activeTenant();
      const snapshot = () => prisma.hubImage.findMany({ where: { organisationId: victim.organisationId }, orderBy: { id: "asc" } });
      await expectCrossTenantDenied(
        attacker,
        [
          { method: "post", path: `${base(victim, "posts")}/${id}/images`, body: {} },
          { method: "delete", path: `${base(victim, "posts")}/${id}/images/${img.id}` },
          { method: "post", path: `${base(victim, "posts")}/${id}/images/${second.id}/main` },
        ],
        { snapshot },
      );
      // Guessing ids under the attacker's own organisation.
      const mine = await draft(attacker, "posts");
      const own = (await upload(attacker, "posts", mine, pngPlain()).expect(201)).body.image;
      for (const r of [
        await upload(attacker, "posts", id, pngPlain()),
        await request(app).delete(`${base(attacker, "posts")}/${id}/images/${img.id}`).set(as(attacker)),
        await request(app).delete(`${base(attacker, "posts")}/${mine}/images/${img.id}`).set(as(attacker)),
        await request(app).post(`${base(attacker, "posts")}/${mine}/images/${second.id}/main`).set(as(attacker)),
      ])
        expect([r.status, ["POST_NOT_FOUND", "IMAGE_NOT_FOUND"].includes(r.body.error.code)]).toEqual([404, true]);
      expect(await snapshot()).toHaveLength(2);
      expect((await item(attacker, "posts", mine)).images).toEqual([own]);
    });
  });
});
