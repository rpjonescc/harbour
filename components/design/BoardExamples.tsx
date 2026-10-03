import { Board } from "@/components/actions/board";
import { WorkStrip } from "@/components/today/WorkStrip";
import { BOARD_EXAMPLE_NOW, EXAMPLE_STRIPS, exampleBoard } from "./board-example-data";
import { Example } from "./Example";
import { EXAMPLE_PRODUCT } from "./scan-example-data";

/** Fictional board and Today strip: cards in every column, and nothing sends anything. */
export function BoardExamples() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">
        Illustrative cards. Dragging and the buttons are examples and change nothing.
      </p>
      <Example label="Board · a card in every column, a stuck card, a new idea and a parked card">
        <Board
          board={exampleBoard()}
          products={[EXAMPLE_PRODUCT]}
          now={BOARD_EXAMPLE_NOW}
          locale="en-GB"
          today="2026-10-02"
          demo
        />
      </Example>
      {EXAMPLE_STRIPS.map(({ label, strip }) => (
        <Example key={label} label={label}>
          <WorkStrip strip={strip} />
        </Example>
      ))}
    </div>
  );
}
