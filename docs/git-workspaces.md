# Projects, branches and worktrees

The project menu in the composer footer and the empty-state project title
searches saved projects, opens a folder, or creates an independent scratch task.
Each selection restores that project's task and draft.

The Local menu lists the repository's main checkout and existing Git worktrees.
New worktree asks for a new branch name and creates a separate directory under
the Hiroshi data directory, starting from the current committed HEAD. Local
uncommitted changes stay in Local. Opening an existing worktree restores its
task; it does not create another worktree.

The branch menu searches local branches. A check marks the current branch;
branches checked out in other worktrees are disabled. Select a free branch or
choose Create and checkout new branch. Return submits the name; Escape cancels.
Each successful checkout starts a fresh task. Earlier task history stays
available, but native CLI conversations from that checkout require explicit
recovery before reuse.

Hiroshi never discards or automatically stashes dirty files. Commit or stash
them before switching branches. Creating a worktree is allowed with dirty
Local files because it reads the committed snapshot. Create a first commit
before adding a worktree to an empty repository. Detached HEAD remains visible.
Open the repository root to use these menus from a nested project folder.

Git operations use argument arrays, bounded processes, no interactive prompts
and disabled checkout hooks. The daemon rejects stale repository revisions and
serializes Git mutations against new prompts, shell runs, commits and rewinds.
Active commands, provider/tool turns or unresolved rewind recovery block a
change. External Git clients can still change the repository independently;
refresh the menu after an external change.

If a connection or daemon fails after Git created a worktree, reopen the menu:
the worktree list comes from Git itself, so an existing checkout can be opened
without repeating creation. Hiroshi does not automatically delete worktrees or
branches after an error.

Validation includes real daemon/process tests in `engine/test/workspace-git.test.ts`,
native component tests, and `bun run test:git` against both the source and
packaged Windows application. Window tests use temporary repositories and
engine homes, run one window at a time, and remain behind the process/RAM guard.
