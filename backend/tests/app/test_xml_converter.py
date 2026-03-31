"""Unit tests for app.xml_converter — convert_xml_to_html."""

from __future__ import annotations

import pytest

from app.xml_converter import convert_xml_to_html


@pytest.mark.unit
class TestConvertXmlToHtml:
    """Tests for the XML-to-HTML conversion function."""

    # --- Basic structure ---

    def test_minimal_valid_xml(self):
        xml = '<document xType="judgment"></document>'
        html = convert_xml_to_html(xml)
        assert "<!DOCTYPE html>" in html
        assert "<html" in html
        assert "</html>" in html
        assert "</body>" in html

    def test_returns_html_with_polish_lang(self):
        xml = "<root></root>"
        html = convert_xml_to_html(xml)
        assert 'lang="pl"' in html

    # --- Metadata rendering ---

    def test_document_metadata_from_x_attributes(self):
        xml = '<root xCourtName="Sąd Okręgowy" xDate="2024-01-15"></root>'
        html = convert_xml_to_html(xml)
        assert "CourtName" in html
        assert "Sąd Okręgowy" in html
        assert "Date" in html
        assert "2024-01-15" in html

    def test_non_x_attributes_are_skipped(self):
        xml = '<root id="123" xName="test"></root>'
        html = convert_xml_to_html(xml)
        assert "Name" in html  # xName → displayed
        # "id" should not appear in metadata section
        # (it won't have <strong>id:</strong> format)

    # --- Text elements ---

    def test_xtext_renders_as_paragraph(self):
        xml = "<root><xText>Hello World</xText></root>"
        html = convert_xml_to_html(xml)
        assert "<p>" in html
        assert "Hello World" in html

    def test_empty_xtext_renders_empty_line(self):
        xml = "<root><xText></xText></root>"
        html = convert_xml_to_html(xml)
        assert "empty-line" in html

    def test_xtext_bold_attribute(self):
        xml = '<root><xText xBold="true">Bold text</xText></root>'
        html = convert_xml_to_html(xml)
        assert "bold" in html

    def test_xtext_right_alignment(self):
        xml = '<root><xText xALIGNx="right">Right aligned</xText></root>'
        html = convert_xml_to_html(xml)
        assert "right-align" in html

    def test_xtext_center_alignment(self):
        xml = '<root><xText xALIGNx="center">Centered</xText></root>'
        html = convert_xml_to_html(xml)
        assert "center-align" in html

    # --- Inline formatting ---

    def test_bold_inline(self):
        xml = "<root><xText><xBx>Bold</xBx> text</xText></root>"
        html = convert_xml_to_html(xml)
        assert "<strong>Bold</strong>" in html

    def test_italic_inline(self):
        xml = "<root><xText><xIx>Italic</xIx> text</xText></root>"
        html = convert_xml_to_html(xml)
        assert "<em>Italic</em>" in html

    def test_underline_inline(self):
        xml = "<root><xText><xUx>Underline</xUx> text</xText></root>"
        html = convert_xml_to_html(xml)
        assert "<u>Underline</u>" in html

    def test_superscript(self):
        xml = "<root><xText>Art. 5<xSUPx>2</xSUPx></xText></root>"
        html = convert_xml_to_html(xml)
        assert "<sup>2</sup>" in html

    def test_line_break(self):
        xml = "<root><xText>Line 1<xBRx/>Line 2</xText></root>"
        html = convert_xml_to_html(xml)
        assert "<br>" in html

    def test_anonymized_content(self):
        xml = "<root><xText><xAnon>Jan K.</xAnon></xText></root>"
        html = convert_xml_to_html(xml)
        assert "anonymized" in html
        assert "Jan K." in html

    # --- Legal references ---

    def test_legal_reference_with_title(self):
        xml = '<root><xText><xLexLink xTitle="Kodeks cywilny art. 5">art. 5 k.c.</xLexLink></xText></root>'
        html = convert_xml_to_html(xml)
        assert "legal-reference" in html
        assert "art. 5 k.c." in html
        assert 'title="Kodeks cywilny art. 5"' in html

    def test_legal_reference_without_title(self):
        xml = "<root><xText><xLexLink>art. 10</xLexLink></xText></root>"
        html = convert_xml_to_html(xml)
        assert "legal-reference" in html
        assert "art. 10" in html
        assert "title=" not in html.split("legal-reference")[1].split(">")[0]

    # --- xName and xTitle ---

    def test_xname_renders_as_bold_div(self):
        xml = "<root><xName>Section Name</xName></root>"
        html = convert_xml_to_html(xml)
        assert "element-xname" in html
        assert "Section Name" in html

    def test_xtitle_renders_with_title_class(self):
        xml = "<root><xTitle>Document Title</xTitle></root>"
        html = convert_xml_to_html(xml)
        assert "title" in html
        assert "Document Title" in html

    # --- xUnit elements ---

    def test_xunit_renders_as_div(self):
        xml = '<root><xUnit xType="normal"><xText>Unit content</xText></xUnit></root>'
        html = convert_xml_to_html(xml)
        assert "Unit content" in html

    def test_xunit_with_title_attribute(self):
        xml = '<root><xUnit xIsTitle="true"><xText>Title Unit</xText></xUnit></root>'
        html = convert_xml_to_html(xml)
        assert "title" in html.lower()

    # --- xBlock elements ---

    def test_xblock_renders_section_div(self):
        xml = "<root><xBlock><xText>Block content</xText></xBlock></root>"
        html = convert_xml_to_html(xml)
        assert "section" in html
        assert "Block content" in html

    # --- xEnum (bullet list) ---

    def test_xenum_renders_as_unordered_list(self):
        xml = """<root>
            <xEnum>
                <xEnumElem>Item one</xEnumElem>
                <xEnumElem>Item two</xEnumElem>
            </xEnum>
        </root>"""
        html = convert_xml_to_html(xml)
        assert "bullet-list" in html
        assert "<li>" in html
        assert "Item one" in html
        assert "Item two" in html

    # --- Numbered lists ---

    def test_numbered_units_as_ordered_list(self):
        xml = """<root>
            <xUnit xIsTitle="false" xType="none">
                <xName>1.</xName>
                <xText>First item</xText>
            </xUnit>
            <xUnit xIsTitle="false" xType="none">
                <xName>2.</xName>
                <xText>Second item</xText>
            </xUnit>
        </root>"""
        html = convert_xml_to_html(xml)
        assert "<ol>" in html
        assert "<li>" in html
        assert "First item" in html

    def test_roman_numeral_list(self):
        xml = """<root>
            <xUnit xIsTitle="false" xType="none">
                <xName>I.</xName>
                <xText>First roman</xText>
            </xUnit>
            <xUnit xIsTitle="false" xType="none">
                <xName>II.</xName>
                <xText>Second roman</xText>
            </xUnit>
        </root>"""
        html = convert_xml_to_html(xml)
        assert "roman-list" in html

    # --- Tables ---

    def test_table_renders(self):
        xml = """<root>
            <xRows>
                <xRow>
                    <xClmn xALIGNx="left">
                        <xText>Cell 1</xText>
                    </xClmn>
                    <xClmn xALIGNx="right">
                        <xText>Cell 2</xText>
                    </xClmn>
                </xRow>
            </xRows>
        </root>"""
        html = convert_xml_to_html(xml)
        assert '<table class="table">' in html
        assert "<tr>" in html
        assert "<td" in html
        assert "Cell 1" in html
        assert "Cell 2" in html

    def test_table_with_colgroup(self):
        xml = """<root>
            <xRows>
                <xCOLGROUPx>
                    <xCOLx xWIDTHx="200" />
                    <xCOLx xWIDTHx="300" />
                </xCOLGROUPx>
                <xRow>
                    <xClmn><xText>A</xText></xClmn>
                    <xClmn><xText>B</xText></xClmn>
                </xRow>
            </xRows>
        </root>"""
        html = convert_xml_to_html(xml)
        assert "<colgroup>" in html
        assert "width: 200px" in html
        assert "width: 300px" in html

    def test_table_column_alignment(self):
        xml = """<root>
            <xRows>
                <xRow>
                    <xClmn xALIGNx="center" xVALIGNx="middle">
                        <xText>Centered</xText>
                    </xClmn>
                </xRow>
            </xRows>
        </root>"""
        html = convert_xml_to_html(xml)
        assert "text-align: center" in html
        assert "vertical-align: middle" in html

    # --- Error handling ---

    def test_invalid_xml_returns_error_html(self):
        html = convert_xml_to_html("<not-closed>")
        assert "XML Parse Error" in html

    def test_completely_broken_input(self):
        html = convert_xml_to_html("not xml at all <<<>>>")
        assert "XML Parse Error" in html or "Conversion Error" in html

    def test_empty_string_input(self):
        html = convert_xml_to_html("")
        assert "Error" in html

    # --- Nested formatting ---

    def test_bold_inside_italic(self):
        xml = "<root><xText><xIx><xBx>Bold Italic</xBx></xIx></xText></root>"
        html = convert_xml_to_html(xml)
        assert "<strong>Bold Italic</strong>" in html
        assert "<em>" in html

    def test_mixed_inline_and_tail_text(self):
        xml = "<root><xText>Before <xBx>bold</xBx> after</xText></root>"
        html = convert_xml_to_html(xml)
        assert "Before" in html
        assert "<strong>bold</strong>" in html
        assert "after" in html

    # --- Standalone inline elements ---

    def test_standalone_bold_element(self):
        xml = "<root><xBx>Standalone bold</xBx></root>"
        html = convert_xml_to_html(xml)
        assert "<strong>Standalone bold</strong>" in html

    def test_standalone_italic_element(self):
        xml = "<root><xIx>Standalone italic</xIx></root>"
        html = convert_xml_to_html(xml)
        assert "<em>Standalone italic</em>" in html

    def test_standalone_underline_element(self):
        xml = "<root><xUx>Standalone underline</xUx></root>"
        html = convert_xml_to_html(xml)
        assert "<u>Standalone underline</u>" in html

    # --- CSS and styling ---

    def test_css_styles_included(self):
        xml = "<root></root>"
        html = convert_xml_to_html(xml)
        assert "<style>" in html
        assert ".document-header" in html
        assert ".legal-reference" in html
        assert ".anonymized" in html

    # --- Unknown/fallback elements ---

    def test_unknown_element_with_text_renders(self):
        xml = "<root><customTag>Custom content</customTag></root>"
        html = convert_xml_to_html(xml)
        assert "Custom content" in html

    def test_unknown_element_without_text_processes_children(self):
        xml = "<root><wrapper><xText>Inner text</xText></wrapper></root>"
        html = convert_xml_to_html(xml)
        assert "Inner text" in html

    # --- xCOLGROUPx/xCOLx standalone are ignored ---

    def test_colgroup_outside_table_is_ignored(self):
        xml = """<root>
            <xCOLGROUPx>
                <xCOLx xWIDTHx="100" />
            </xCOLGROUPx>
        </root>"""
        html = convert_xml_to_html(xml)
        # Should not crash, and should not have table/colgroup outside xRows
        assert "<!DOCTYPE html>" in html
