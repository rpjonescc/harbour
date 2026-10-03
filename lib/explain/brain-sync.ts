/** Shown when Harbour could not list the interrupted-run records: what happened, what it means, what to do. */
export const RECOVERY_UNCHECKED =
  "Harbour couldn't check whether an earlier run was interrupted, so saving and new runs are paused. Check that Harbour can read the quarantine folder next to its database.";

/** Shown when Harbour could not count the saved notes still waiting to reach GitHub. */
export const SYNC_UNCHECKED =
  "Harbour couldn't check whether your saved notes reached GitHub. They are safe on this computer. Check that the brain folder has a GitHub branch to push to.";
