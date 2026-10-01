import "@testing-library/jest-dom/vitest";
import { scrubGitEnv } from "./git-env";

scrubGitEnv(process.env);
