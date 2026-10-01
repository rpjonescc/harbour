import { enqueueGitJob } from "../git-job-route";

export function POST(request: Request) {
  return enqueueGitJob(request, "brain-push");
}
