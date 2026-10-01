/** Small trend arrow with screen-reader text; renders nothing when unchanged. */
export function Delta({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span className={`ml-1 text-2xs ${up ? "text-good" : "text-bad"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{`${up ? "up" : "down"} ${Math.abs(value)}`}</span>
    </span>
  );
}
