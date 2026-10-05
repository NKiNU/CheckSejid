import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler, notFound } from "./errors.ts";
import { identityRouter } from "./modules/identity/identity.routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(identityRouter);

app.use(notFound);
app.use(errorHandler);
