import { piece } from "@/components/content/content-fixtures";
import { Example } from "./Example";
import { PieceWithActions } from "./PieceWithActions";

/** "Send to Postiz as a draft" in each state, from fictional data. */
export function PostizExamples() {
  return (
    <>
      <Example label="Send an approved piece to Postiz as a draft">
        <PieceWithActions
          piece={piece({
            id: "acme-docs-20261002-ex-postiz.linkedin",
            title: "Postiz example",
            tab: "approved",
            state: "approved",
            postiz: { sentAt: null, sending: false, error: null },
          })}
        />
      </Example>
      <Example label="A piece already in Postiz: sending again asks first">
        <PieceWithActions
          piece={piece({
            id: "acme-docs-20261002-ex-postiz-sent.linkedin",
            title: "Postiz sent example",
            tab: "approved",
            state: "approved",
            postiz: { sentAt: "3 Oct 2026, 11:00", sending: false, error: null },
          })}
        />
      </Example>
      <Example label="A send to Postiz that didn't finish, and why">
        <PieceWithActions
          piece={piece({
            id: "acme-docs-20261002-ex-postiz-failed.linkedin",
            title: "Postiz failed example",
            tab: "approved",
            state: "approved",
            postiz: {
              sentAt: null,
              sending: false,
              error:
                "Harbour couldn't reach Postiz, so nothing was sent. Check that Postiz is running, then try again.",
            },
          })}
        />
      </Example>
    </>
  );
}
