import { danger, fail, warn } from 'danger';

import { evaluatePullRequest } from './scripts/danger/pr-policies.js';
import { reportFindings } from './scripts/danger/report-findings.js';

const pullRequest = danger.github.pr;
const files = [
  ...danger.git.created_files,
  ...danger.git.modified_files,
  ...danger.git.deleted_files,
];
const results = evaluatePullRequest({
  title: pullRequest.title,
  body: pullRequest.body,
  baseBranch: pullRequest.base.ref,
  headBranch: pullRequest.head.ref,
  files: [...new Set(files)],
  additions: pullRequest.additions,
  deletions: pullRequest.deletions,
});

reportFindings(results, { fail, warn });
