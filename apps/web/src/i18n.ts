import type { Lang } from './domain/calendar';

const en = {
  greeting: 'Assalamualaikum',
  bulletin: 'Bulletin', discover: 'Discover', prayer: 'Prayer', me: 'Me',
  all: 'All', announcements: 'Announcements', events: 'Events', classes: 'Classes', about: 'About',
  announcement: 'Announcement', event: 'Event', class: 'Class', pinned: 'Pinned',
  latestFollowed: 'Latest from organisations you follow',
  emptyFeed: 'Nothing here yet. Follow organisations to see their bulletin.',
  findOrgs: 'Find organisations',
  follow: 'Follow', following: 'Following',
  followHint: 'Following shows this organisation’s posts in your bulletin. It does not make you a committee member.',
  discoverHint: 'Follow organisations to see their bulletin on your home',
  search: 'Search masjid, surau, organisation', searchLabel: 'Search organisations',
  near: 'Near', noOrgs: 'No organisations match. Try another type or name.',
  latest: 'Latest', nextPrayer: 'Next prayer', in: 'in', tomorrow: 'tomorrow',
  gregorian: 'Gregorian', hijri: 'Hijri', hijriNote: 'Hijri date is calculated. Local moon sighting may differ by a day.',
  source: 'Source', qibla: 'Qibla', qiblaNote: 'Approximate: based on your area, not GPS. Calibrate your compass for accuracy.',
  usePrecise: 'Use precise location', preciseUnavailable: 'Location is not available on this device. Showing the direction for your area.',
  back: 'Back', notifications: 'Notifications', language: 'Language',
  donations: 'Online donations', donationsNote: 'Not available yet in Masyarakat', comingSoon: 'Coming soon',
  address: 'Address', followedOrgs: 'Organisations you follow', manage: 'Open organisation workspace',
  noPosts: 'No published posts yet.',
};
export type Key = keyof typeof en;

const ms: Record<Key, string> = {
  greeting: 'Assalamualaikum',
  bulletin: 'Buletin', discover: 'Teroka', prayer: 'Solat', me: 'Saya',
  all: 'Semua', announcements: 'Pengumuman', events: 'Acara', classes: 'Kelas', about: 'Tentang',
  announcement: 'Pengumuman', event: 'Acara', class: 'Kelas', pinned: 'Disemat',
  latestFollowed: 'Terkini daripada organisasi yang anda ikuti',
  emptyFeed: 'Belum ada apa-apa. Ikuti organisasi untuk melihat buletin mereka.',
  findOrgs: 'Cari organisasi',
  follow: 'Ikuti', following: 'Mengikuti',
  followHint: 'Mengikuti memaparkan hantaran organisasi ini dalam buletin anda. Ia tidak menjadikan anda ahli jawatankuasa.',
  discoverHint: 'Ikuti organisasi untuk melihat buletin mereka di laman utama',
  search: 'Cari masjid, surau, organisasi', searchLabel: 'Cari organisasi',
  near: 'Berhampiran', noOrgs: 'Tiada organisasi sepadan. Cuba jenis atau nama lain.',
  latest: 'Terkini', nextPrayer: 'Solat seterusnya', in: 'dalam', tomorrow: 'esok',
  gregorian: 'Masihi', hijri: 'Hijrah', hijriNote: 'Tarikh Hijrah dikira. Rukyah tempatan mungkin berbeza sehari.',
  source: 'Sumber', qibla: 'Kiblat', qiblaNote: 'Anggaran: berdasarkan kawasan, bukan GPS. Tentukur kompas untuk ketepatan.',
  usePrecise: 'Guna lokasi tepat', preciseUnavailable: 'Lokasi tidak tersedia pada peranti ini. Arah ditunjukkan untuk kawasan anda.',
  back: 'Kembali', notifications: 'Pemberitahuan', language: 'Bahasa',
  donations: 'Derma dalam talian', donationsNote: 'Belum tersedia dalam Masyarakat', comingSoon: 'Akan datang',
  address: 'Alamat', followedOrgs: 'Organisasi yang anda ikuti', manage: 'Buka ruang kerja organisasi',
  noPosts: 'Belum ada hantaran diterbitkan.',
};

export const DICTIONARY: Record<Lang, Record<Key, string>> = { en, ms };
