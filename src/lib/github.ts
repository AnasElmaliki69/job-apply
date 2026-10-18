// Public DTOs only. Credentials and provider calls live in github-server.ts.
export type GithubConnection = { configured:boolean; connected:boolean; login?:string; linked?:boolean };
export type GithubInstallation = { id:number; account:string };
export type GithubRepository = { id:number; name:string; fullName:string; private:boolean; branch:string; url:string };
export type GithubCommit = { sha:string; message:string; author:string; date:string|null; url:string };
export type GithubActivity = { repository:GithubRepository|null; commits:GithubCommit[]; checkedAt:string; page:number; hasMore:boolean; head:string|null };
