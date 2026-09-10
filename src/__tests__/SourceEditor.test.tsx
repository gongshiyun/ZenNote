import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";
import { SourceEditor } from "../components/editor/SourceEditor";
import { useStore } from "../store";

describe("SourceEditor external reload", () => {
  beforeEach(() => {
    useStore.setState({
      currentFilePath: "/notes/a.md",
      content: "old",
      scrollPosition: 0,
      cursorLine: 1,
      cursorCol: 1,
      reloadTick: 0,
      tabSize: 2,
      editorPadding: 80,
    });
  });

  it("applies an explicit external reload even while the source editor has focus", () => {
    const ref = createRef<EditorView>();
    render(<SourceEditor viewRef={ref} />);
    ref.current?.focus();

    act(() => {
      useStore.setState({ content: "external", reloadTick: 1 });
    });

    expect(ref.current?.state.doc.toString()).toBe("external");
  });

  it("restores the source selection when the same content is reopened", () => {
    useStore.setState({
      cmSelection: { anchor: 1, head: 3, content: "old" },
    });
    const ref = createRef<EditorView>();

    render(<SourceEditor viewRef={ref} />);

    expect(ref.current?.state.selection.main.from).toBe(1);
    expect(ref.current?.state.selection.main.to).toBe(3);
  });
});
