/** Shared decorative backdrop for the login/signup screens — two lit
 *  bookshelf walls flanking a blurred room. Pure CSS, no image asset, so it
 *  never breaks offline and stays crisp at any size. */

/** A curated, warm "leather-bound" palette — not a full hue sweep — so the
 *  shelf reads as intentional library decor rather than a random rainbow. */
const SPINE_PALETTE = ['#6b3f2a', '#7a5230', '#5c4632', '#8a6a3a', '#4a3626', '#6e4a1f', '#54331f'];

/** One shelf: a row of book spines sitting on a lit wooden ledge. */
function Shelf({ count, seed }) {
  const spines = Array.from({ length: count }, (_, i) => {
    const n = (i + 1) * seed;
    const grow = 1 + (n % 4);
    const height = 60 + (n % 35); // 60-94%
    const color = SPINE_PALETTE[n % SPINE_PALETTE.length];
    return (
      <span
        key={i}
        className="login-spine"
        style={{ flexGrow: grow, height: `${height}%`, background: color }}
      />
    );
  });
  return (
    <div className="login-shelf-row">
      <div className="login-spine-row">{spines}</div>
      <div className="login-shelf-board" />
    </div>
  );
}

function ShelfColumn({ side }) {
  return (
    <div className={`login-shelf-side login-shelf-${side}`} aria-hidden="true">
      <Shelf count={7} seed={3} />
      <Shelf count={8} seed={5} />
      <Shelf count={6} seed={7} />
      <Shelf count={7} seed={11} />
      <Shelf count={8} seed={13} />
    </div>
  );
}

export default function LibraryScene() {
  return (
    <>
      <div className="login-scene" aria-hidden="true">
        <ShelfColumn side="left" />
        <div className="login-room">
          <div className="login-room-window" />
          <div className="login-room-plant" />
        </div>
        <ShelfColumn side="right" />
      </div>
      <div className="login-scrim" aria-hidden="true" />
    </>
  );
}
