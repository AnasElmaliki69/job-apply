import { handleGithub } from '@/lib/github-handler';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export { handleGithub as GET,handleGithub as POST,handleGithub as PUT,handleGithub as DELETE };
