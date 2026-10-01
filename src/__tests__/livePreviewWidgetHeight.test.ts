import { describe, expect, it } from 'vitest';
import {
  BLOCK_ESTIMATE,
  FrontmatterWidget,
  HtmlBlockWidget,
  ImageWidget,
  MathWidget,
  MermaidWidget,
  TableWidget,
  TocWidget,
  type CellSegment,
} from '../components/editor/livepreview/widgets';
import { MermaidPlaceholder } from '../components/editor/livepreview/livePreview';

// Height estimates for block widgets.
//
// CodeMirror renders only the viewport. Every block widget outside it is stood
// in for by filler of `estimatedHeight` pixels, and the WidgetType default is
// "no idea" — so the height of everything above the viewport is estimated at
// roughly one line per block. When those blocks are finally measured the height
// map is corrected in one go and the scroll position moves with it: the view
// jumps backwards while scrolling down, at the same place every time, because
// it depends on which large blocks sit above.
//
// A block widget that declares no estimate is therefore not merely inefficient,
// it is a scrolling bug. This pins that down.

const paragraph: CellSegment[] = [{ text: 'x', mark: null, href: null }];

/** Every block replacement the Live Preview editor can place. */
const BLOCK_WIDGETS: Array<[string, { estimatedHeight: number }]> = [
  ['table', new TableWidget(paragraph, [paragraph], [null], 'table-key')],
  ['image', new ImageWidget('assets/a.png', 'alt')],
  ['display math', new MathWidget('<span>x</span>', true)],
  ['html block', new HtmlBlockWidget('<p>hi</p>')],
  ['frontmatter', new FrontmatterWidget('title: t\ntags: [a]')],
  ['toc', new TocWidget([{ level: 2, text: 'H', pos: 0 }], 'toc-key')],
  ['mermaid', new MermaidWidget('<svg></svg>', 'mermaid-key')],
  ['mermaid placeholder', new MermaidPlaceholder()],
];

describe('live preview widgets — estimated height', () => {
  it.each(BLOCK_WIDGETS)('%s reports an estimate CodeMirror can use', (_name, widget) => {
    expect(Number.isFinite(widget.estimatedHeight)).toBe(true);
    expect(widget.estimatedHeight).toBeGreaterThan(0);
  });

  it('keeps inline math at the CodeMirror default', () => {
    // Inline maths lives inside a line whose height the line already accounts
    // for. Estimating it as a block would overstate every such line.
    expect(new MathWidget('<span>x</span>', false).estimatedHeight).toBe(-1);
  });

  it('shrinks the estimate for an image with no source', () => {
    // That case renders one line of alt text, so the picture estimate would
    // overstate it by most of a screen.
    const missing = new ImageWidget('', 'gone').estimatedHeight;
    expect(missing).toBeLessThan(new ImageWidget('a.png', 'there').estimatedHeight);
    expect(missing).toBeGreaterThan(0);
  });

  it('scales the table estimate with its row count', () => {
    // A fixed estimate would be wrong for exactly the tables that need it most.
    const one = new TableWidget(paragraph, [paragraph], [null], 'k1').estimatedHeight;
    const five = new TableWidget(paragraph, Array(5).fill(paragraph), [null], 'k5').estimatedHeight;
    expect(five - one).toBe(4 * BLOCK_ESTIMATE.tableRow);
  });

  it('scales the frontmatter estimate with its line count', () => {
    const one = new FrontmatterWidget('a: 1').estimatedHeight;
    const four = new FrontmatterWidget('a: 1\nb: 2\nc: 3\nd: 4').estimatedHeight;
    expect(four - one).toBe(3 * BLOCK_ESTIMATE.frontmatterLine);
  });

  it('scales the TOC estimate with its entry count', () => {
    const one = new TocWidget([{ level: 1, text: 'a', pos: 0 }], 'k1').estimatedHeight;
    const six = new TocWidget(
      Array.from({ length: 6 }, (_, i) => ({ level: 1, text: `h${i}`, pos: i })),
      'k6',
    ).estimatedHeight;
    expect(six - one).toBe(5 * BLOCK_ESTIMATE.tocItem);
  });
});
