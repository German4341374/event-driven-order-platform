# Contributing

Use Node.js 24 and Conventional Commits. Create a focused branch, run `npm ci` and
`npm run check`, then describe behavior and operational impact in the pull request.

Schema changes must be additive or include explicit compatibility and rollback notes. Changes to
message contracts must explain how old consumers continue to operate during a rolling deployment.
