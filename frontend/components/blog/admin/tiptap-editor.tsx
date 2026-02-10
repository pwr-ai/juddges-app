"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { createLowlight } from "lowlight";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";

const lowlight = createLowlight();
lowlight.register("typescript", typescript);
lowlight.register("javascript", javascript);
lowlight.register("python", python);
lowlight.register("bash", bash);
lowlight.register("json", json);
lowlight.register("xml", xml);
import { Separator } from "@/components/ui/separator";
import { IconButton, ToggleButton } from "@/lib/styles/components";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  CodeSquare,
  Minus,
} from "lucide-react";
import { useCallback } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/lib/styles/components/tooltip";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const MenuBar = ({ editor }: { editor: Editor | null }): React.JSX.Element | null => {
  const setLink = useCallback((): void => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    // cancelled
    if (url === null) {
      return;
    }

    // empty
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    // update link
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;

    const url = window.prompt("Image URL");

    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;

    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="border border-input bg-background rounded-t-lg p-2 flex flex-wrap gap-1">
        {/* Text Formatting */}
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("bold")}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  size="sm"
                >
                  <Bold className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Bold (Ctrl+B)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("italic")}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  size="sm"
                >
                  <Italic className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Italic (Ctrl+I)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("underline")}
                  onClick={() =>
                    editor.chain().focus().toggleUnderline().run()
                  }
                  size="sm"
                >
                  <UnderlineIcon className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Underline (Ctrl+U)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("strike")}
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  size="sm"
                >
                  <Strikethrough className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Strikethrough</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("code")}
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  size="sm"
                >
                  <Code className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Inline Code</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Headings */}
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("heading", { level: 1 })}
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 1 }).run()
                  }
                  size="sm"
                >
                  <Heading1 className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Heading 1</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("heading", { level: 2 })}
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                  size="sm"
                >
                  <Heading2 className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Heading 2</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("heading", { level: 3 })}
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run()
                  }
                  size="sm"
                >
                  <Heading3 className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Heading 3</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Lists & Quotes */}
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("bulletList")}
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  size="sm"
                >
                  <List className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Bullet List</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("orderedList")}
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  size="sm"
                >
                  <ListOrdered className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Numbered List</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("blockquote")}
                  onClick={() =>
                    editor.chain().focus().toggleBlockquote().run()
                  }
                  size="sm"
                >
                  <Quote className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Blockquote</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive("codeBlock")}
                  onClick={() =>
                    editor.chain().focus().toggleCodeBlock().run()
                  }
                  size="sm"
                >
                  <CodeSquare className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Code Block</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Alignment */}
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive({ textAlign: "left" })}
                  onClick={() =>
                    editor.chain().focus().setTextAlign("left").run()
                  }
                  size="sm"
                >
                  <AlignLeft className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Align Left</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive({ textAlign: "center" })}
                  onClick={() =>
                    editor.chain().focus().setTextAlign("center").run()
                  }
                  size="sm"
                >
                  <AlignCenter className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Align Center</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive({ textAlign: "right" })}
                  onClick={() =>
                    editor.chain().focus().setTextAlign("right").run()
                  }
                  size="sm"
                >
                  <AlignRight className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Align Right</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleButton
                  isActive={editor.isActive({ textAlign: "justify" })}
                  onClick={() =>
                    editor.chain().focus().setTextAlign("justify").run()
                  }
                  size="sm"
                >
                  <AlignJustify className="size-4" />
                </ToggleButton>
              </div>
            </TooltipTrigger>
            <TooltipContent>Justify</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Insert */}
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <IconButton
                  icon={LinkIcon}
                  onClick={setLink}
                  variant={editor.isActive("link") ? "default" : "muted"}
                  size="sm"
                  aria-label="Insert Link"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Insert Link</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <IconButton
                  icon={ImageIcon}
                  onClick={addImage}
                  variant="muted"
                  size="sm"
                  aria-label="Insert Image"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Insert Image</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <IconButton
                  icon={TableIcon}
                  onClick={insertTable}
                  variant="muted"
                  size="sm"
                  aria-label="Insert Table"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Insert Table</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <IconButton
                  icon={Minus}
                  onClick={() => editor.chain().focus().setHorizontalRule().run()}
                  variant="muted"
                  size="sm"
                  aria-label="Horizontal Rule"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Horizontal Rule</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* History */}
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <IconButton
                  icon={Undo}
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  variant="muted"
                  size="sm"
                  aria-label="Undo"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <IconButton
                  icon={Redo}
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  variant="muted"
                  size="sm"
                  aria-label="Redo"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};

export function TiptapEditor({
  content,
  onChange,
  placeholder = "Start writing your blog post...",
}: TiptapEditorProps): React.JSX.Element {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We'll use CodeBlockLowlight instead
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-4 cursor-pointer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-lg",
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class:
            "bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto my-4",
        },
      }),
      Table.configure({
        HTMLAttributes: {
          class: "border-collapse table-auto w-full my-4",
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: "border-b border-border",
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: "border border-border bg-muted px-4 py-2 text-left font-semibold",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: "border border-border px-4 py-2",
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Underline,
      TextStyle,
      Color,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-[400px] p-6",
      },
    },
  });

  return (
    <div className="border border-input rounded-lg bg-background">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
