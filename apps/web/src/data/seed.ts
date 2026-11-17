/**
 * In-memory seed data until the backend phases (02, 05, 06, 08) land.
 * Dates are relative to page load so the demo always reads "2 hours ago", "this Friday" and so on.
 */
import type { FinancialRecord } from '../domain/finance';
import type { PrayerDay } from '../domain/prayer';
import type { Organisation, Post } from '../domain/types';

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const inDays = (days: number, hour: number, minute = 0) => {
  const d = new Date(Date.now() + days * 24 * HOUR);
  // Set Malaysia wall-clock time (UTC+8, no DST).
  d.setUTCHours(hour - 8, minute, 0, 0);
  return d.toISOString();
};
const dateOnly = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * HOUR).toISOString().slice(0, 10);

export const WORKSPACE_ORG_ID = 'org-hidayah';
export const CURRENT_USER = { id: 'u-aisyah', name: 'Aisyah' };

export const ORGANISATIONS: Organisation[] = [
  { id: 'org-hidayah', slug: 'masjid-al-hidayah', name: 'Masjid Al-Hidayah', initials: 'AH', type: 'Masjid', area: 'Setapak', address: 'Jalan Melati 3, 53100 Kuala Lumpur', description: 'Community masjid serving Taman Melati and Setapak. Daily congregational prayers, weekly kuliah, Friday prayers and a children’s Quran class.', visibility: 'PUBLIC', plan: 'STARTER', trialEndsAt: inDays(23, 0), tone: 'brand' },
  { id: 'org-nur', slug: 'surau-an-nur', name: 'Surau An-Nur', initials: 'AN', type: 'Surau', area: 'Wangsa Maju', address: 'Jalan 4/27A, Wangsa Maju, Kuala Lumpur', description: 'Neighbourhood surau with weekly Fardu Ain classes for adults.', visibility: 'PUBLIC', plan: 'FREE', tone: 'gold' },
  { id: 'org-ilmi', slug: 'madrasah-darul-ilmi', name: 'Madrasah Darul Ilmi', initials: 'DI', type: 'Madrasah', area: 'Gombak', address: 'Batu 6, Jalan Gombak, Selangor', description: 'Part-time madrasah for children aged 7 to 12.', visibility: 'PUBLIC', plan: 'STARTER', tone: 'info' },
  { id: 'org-ihsan', slug: 'pertubuhan-kebajikan-ihsan', name: 'Pertubuhan Kebajikan Ihsan', initials: 'PI', type: 'NGO', area: 'Kampung Baru', address: 'Jalan Raja Muda Musa, Kampung Baru, Kuala Lumpur', description: 'Welfare organisation running a weekly food bank.', visibility: 'PUBLIC', plan: 'FREE', tone: 'plum' },
  { id: 'org-taqwa', slug: 'masjid-at-taqwa', name: 'Masjid At-Taqwa', initials: 'AT', type: 'Masjid', area: 'Titiwangsa', address: 'Jalan Pahang, Titiwangsa, Kuala Lumpur', description: 'Masjid near Titiwangsa lake.', visibility: 'PUBLIC', plan: 'FREE', tone: 'brand' },
  { id: 'org-amal', slug: 'surau-al-amal', name: 'Surau Al-Amal', initials: 'AA', type: 'Surau', area: 'Setiawangsa', address: 'Setiawangsa, Kuala Lumpur', description: 'Shares updates with its own jemaah by link.', visibility: 'UNLISTED', plan: 'FREE', tone: 'gold' },
];

export const DEFAULT_FOLLOWING = ['org-hidayah', 'org-nur', 'org-ihsan'];

const p = (o: Omit<Post, 'createdAt' | 'createdBy'> & Partial<Pick<Post, 'createdBy'>>): Post => ({
  createdBy: 'u-nadia', createdAt: o.publishedAt ?? ago(30), ...o,
});

export const POSTS: Post[] = [
  p({ id: 'p1', orgId: 'org-hidayah', kind: 'announcement', status: 'PUBLISHED', pinned: true, publishedAt: ago(2), startsAt: inDays(4, 8), title: 'Gotong-royong bersihkan masjid', body: 'Sabtu ini, 8:00 pagi. Sarung tangan dan sarapan disediakan. Semua dijemput hadir.' }),
  p({ id: 'p2', orgId: 'org-hidayah', kind: 'event', status: 'PUBLISHED', pinned: false, publishedAt: ago(20), startsAt: inDays(3, 19, 15), title: 'Kuliah Maghrib: Adab bertetangga', body: 'Guest speaker after Maghrib. Open to all; the sisters’ section is available.', createdBy: 'u-hafiz' }),
  p({ id: 'p3', orgId: 'org-hidayah', kind: 'announcement', status: 'PUBLISHED', pinned: false, publishedAt: ago(26), title: 'Parking during Friday prayers', body: 'The field behind the hall is open for parking from 12:30 PM. Please keep the fire lane clear.' }),
  p({ id: 'p4', orgId: 'org-hidayah', kind: 'announcement', status: 'DRAFT', pinned: false, title: 'Jadual imam bulan Disember', body: 'Senarai imam bertugas untuk bulan Disember.', createdBy: 'u-hafiz' }),
  p({ id: 'p5', orgId: 'org-hidayah', kind: 'class', status: 'PUBLISHED', pinned: false, publishedAt: ago(200), startsAt: inDays(12, 9), title: 'Children’s Quran class intake', body: 'Registration at the office after Zohor. Ages 6 to 12.' }),
  p({ id: 'p6', orgId: 'org-hidayah', kind: 'announcement', status: 'ARCHIVED', pinned: false, publishedAt: ago(900), title: 'Ramadan iftar schedule', body: 'Archived.' }),
  p({ id: 'p7', orgId: 'org-nur', kind: 'class', status: 'PUBLISHED', pinned: false, publishedAt: ago(6), startsAt: inDays(1, 20, 30), title: 'Kelas Fardu Ain dewasa', body: 'Every Wednesday after Isyak. No registration needed.' }),
  p({ id: 'p8', orgId: 'org-ihsan', kind: 'announcement', status: 'PUBLISHED', pinned: false, publishedAt: ago(28), title: 'Food bank opening hours', body: 'Open Tuesday and Saturday, 10 AM to 1 PM, at the community hall.' }),
  p({ id: 'p9', orgId: 'org-ilmi', kind: 'announcement', status: 'PUBLISHED', pinned: true, publishedAt: ago(50), title: '2027 intake open for ages 7 to 12', body: 'Forms are available at the office every weekday afternoon.' }),
  p({ id: 'p10', orgId: 'org-taqwa', kind: 'announcement', status: 'PUBLISHED', pinned: false, publishedAt: ago(70), title: 'Jadual imam bulan Disember', body: 'Jadual penuh dipaparkan di papan kenyataan.' }),
  p({ id: 'p11', orgId: 'org-amal', kind: 'announcement', status: 'PUBLISHED', pinned: false, publishedAt: ago(10), title: 'Mesyuarat AJK', body: 'Mesyuarat AJK selepas Isyak, Khamis ini.' }),
];

const audit = (by: string, byName: string, upTo: 'DRAFT' | 'PENDING' | 'SUBMITTED', daysAgo: number) => {
  const at = (h: number) => new Date(Date.now() - daysAgo * 24 * HOUR + h * 60_000).toISOString();
  const list: FinancialRecord['audit'] = [{ action: 'Created as draft', actorId: by, actorName: byName, at: at(0), to: 'DRAFT' }];
  if (upTo !== 'DRAFT') list.push({ action: 'Submitted', actorId: by, actorName: byName, at: at(8), from: 'DRAFT', to: 'SUBMITTED' });
  if (upTo === 'PENDING') list.push({ action: 'Sent for approval', actorId: by, actorName: `${byName} (system queue)`, at: at(8), from: 'SUBMITTED', to: 'PENDING_APPROVAL' });
  return list;
};

const rec = (r: Omit<FinancialRecord, 'orgId' | 'currency'>): FinancialRecord => ({ orgId: WORKSPACE_ORG_ID, currency: 'MYR', ...r });

export const FINANCIAL_RECORDS: FinancialRecord[] = [
  rec({ id: 'EXP-0143', kind: 'expense', amount: 18690, date: dateOnly(0), category: 'Maintenance', description: 'Cleaning supplies', status: 'PENDING_APPROVAL', createdBy: 'u-aisyah', createdByName: 'Aisyah', audit: audit('u-aisyah', 'Aisyah', 'PENDING', 0) }),
  rec({ id: 'EXP-0142', kind: 'expense', amount: 185000, date: dateOnly(1), category: 'Maintenance', description: 'Sound system repair', status: 'PENDING_APPROVAL', createdBy: 'u-hafiz', createdByName: 'Hafiz', audit: audit('u-hafiz', 'Hafiz', 'PENDING', 1) }),
  rec({ id: 'EXP-0141', kind: 'expense', amount: 122640, date: dateOnly(2), category: 'Utilities', description: 'Electricity bill, October', status: 'PENDING_APPROVAL', createdBy: 'u-nadia', createdByName: 'Nadia', audit: audit('u-nadia', 'Nadia', 'PENDING', 2) }),
  rec({ id: 'EXP-0140', kind: 'expense', amount: 9500, date: dateOnly(3), category: 'Programmes', description: 'Banner printing', status: 'DRAFT', createdBy: 'u-nadia', createdByName: 'Nadia', audit: audit('u-nadia', 'Nadia', 'DRAFT', 3) }),
  rec({ id: 'EXP-0139', kind: 'expense', amount: 30000, date: dateOnly(5), category: 'Programmes', description: 'Kuliah speaker honorarium', status: 'PENDING_APPROVAL', createdBy: 'u-hafiz', createdByName: 'Hafiz', audit: audit('u-hafiz', 'Hafiz', 'PENDING', 5) }),
  rec({ id: 'EXP-0138', kind: 'expense', amount: 14230, date: dateOnly(7), category: 'Utilities', description: 'Water bill, October', status: 'APPROVED', createdBy: 'u-aisyah', createdByName: 'Aisyah', audit: [...audit('u-aisyah', 'Aisyah', 'PENDING', 7), { action: 'Approved', actorId: 'u-imran', actorName: 'Imran', at: ago(150), from: 'PENDING_APPROVAL', to: 'APPROVED' }] }),
  rec({ id: 'EXP-0136', kind: 'expense', amount: 14230, date: dateOnly(11), category: 'Utilities', description: 'Duplicate: water bill', status: 'VOIDED', createdBy: 'u-nadia', createdByName: 'Nadia', audit: [...audit('u-nadia', 'Nadia', 'DRAFT', 11), { action: 'Voided', actorId: 'u-aisyah', actorName: 'Aisyah', at: ago(250), from: 'DRAFT', to: 'VOIDED', reason: 'Duplicate of EXP-0138' }] }),
  rec({ id: 'INC-0311', kind: 'income', amount: 1842000, date: dateOnly(2), category: 'Friday collection', description: 'Kutipan Jumaat', status: 'APPROVED', createdBy: 'u-nadia', createdByName: 'Nadia', audit: [...audit('u-nadia', 'Nadia', 'PENDING', 2), { action: 'Approved', actorId: 'u-imran', actorName: 'Imran', at: ago(30), from: 'PENDING_APPROVAL', to: 'APPROVED' }] }),
  rec({ id: 'COL-0058', kind: 'collection', amount: 48360, date: dateOnly(4), category: 'Welfare fund', description: 'Welfare box, week 46', status: 'SUBMITTED', createdBy: 'u-nadia', createdByName: 'Nadia', audit: audit('u-nadia', 'Nadia', 'SUBMITTED', 4) }),
];

/** Planned allocation for this month, in sen (finance/BUDGETING.md). */
export const BUDGETS = [
  { category: 'Programmes', planned: 300000 },
  { category: 'Maintenance', planned: 300000 },
  { category: 'Utilities', planned: 150000 },
  { category: 'Welfare', planned: 250000 },
];

export const PRAYER_DAY: PrayerDay = {
  zone: 'WLY01',
  zoneName: 'Kuala Lumpur',
  source: 'Sample times (provider not connected yet)',
  fetchedAt: new Date().toISOString(),
  times: { Subuh: '05:52', Syuruk: '07:03', Zohor: '13:04', Asar: '16:23', Maghrib: '19:05', Isyak: '20:17' },
};

export const AREA = { name: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 };

export const TASKS = [
  { title: 'Submit October utility receipts', who: 'You', due: 'Today', overdue: true },
  { title: 'Confirm speaker for Kuliah Maghrib', who: 'Hafiz', due: 'Thu', overdue: false },
  { title: 'Publish gotong-royong reminder', who: 'Nadia', due: 'Fri', overdue: false },
  { title: 'Review Q4 welfare budget', who: 'You', due: 'Sun', overdue: false },
];

export const ROSTER = [
  { initials: 'HZ', name: 'Hafiz', duty: 'Coordinator', time: '12:00 – 2:00 PM' },
  { initials: 'IR', name: 'Irfan', duty: 'Sound & AV', time: '12:30 – 1:45 PM' },
  { initials: 'NS', name: 'Nadia', duty: 'Collection', time: '1:00 – 2:00 PM' },
];
