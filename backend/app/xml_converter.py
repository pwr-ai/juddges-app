import xml.etree.ElementTree as ET


def convert_xml_to_html(xml_content):
    """
    Transform XML content from Juddges dataset to HTML format
    """
    try:
        root = ET.fromstring(xml_content)

        html_parts = []
        html_parts.append("<!DOCTYPE html>")
        html_parts.append('<html lang="pl">')
        html_parts.append("<head>")
        html_parts.append('<meta charset="UTF-8">')
        html_parts.append(
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        )
        html_parts.append("<title>Dokument Sądowy</title>")
        html_parts.append("<style>")
        html_parts.append("""
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            .document-header { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .signature { font-weight: bold; color: #333; }
            .title { font-size: 1.2em; font-weight: bold; text-align: center; margin: 20px 0; }
            .section { margin: 15px 0; }
            .bold { font-weight: bold; }
            .italic { font-style: italic; }
            .underline { text-decoration: underline; }
            .right-align { text-align: right; }
            .center-align { text-align: center; }
            .court-composition { background-color: #f9f9f9; padding: 10px; border-left: 3px solid #007acc; }
            .table {
                border-collapse: collapse;
                width: 100%;
                margin: 10px 0;
                border: 1px solid #ddd;
            }
            .table td {
                padding: 8px 12px;
                border: 1px solid #ddd;
                vertical-align: top;
            }
            .table colgroup col {
                border-right: 1px solid #ddd;
            }
            .metadata { font-size: 0.9em; color: #666; }
            ol { margin: 10px 0; padding-left: 20px; text-align: left; }
            li { margin: 5px 0; text-align: left; }
            .roman-list {
                list-style-type: upper-roman;
                margin: 10px 0;
                padding-left: 20px;
                text-align: left;
            }
            .bullet-list {
                list-style-type: disc;
                margin: 10px 0;
                padding-left: 20px;
                text-align: left;
            }
            .legal-reference {
                color: #0066cc;
                text-decoration: underline;
                cursor: help;
                font-weight: 500;
            }
            .legal-reference:hover {
                color: #004499;
                background-color: #f0f8ff;
            }
            sup {
                font-size: 0.8em;
                vertical-align: super;
            }
            .anonymized {
                background-color: #f0f0f0;
                color: #666;
                padding: 1px 3px;
                border-radius: 2px;
                font-style: italic;
            }
            .empty-line {
                margin: 0.5em 0;
                min-height: 1em;
            }
            p { margin: 0.5em 0; }
            .element-xname { font-weight: bold; margin: 10px 0; }
        """)
        html_parts.append("</style>")
        html_parts.append("</head>")
        html_parts.append("<body>")

        # Add document metadata
        html_parts.append('<div class="document-header">')
        html_parts.append('<div class="metadata">')
        for attr, value in root.attrib.items():
            if attr.startswith("x"):
                display_name = attr[1:] if attr.startswith("x") else attr
                html_parts.append(f"<strong>{display_name}:</strong> {value}<br>")
        html_parts.append("</div>")
        html_parts.append("</div>")

        def is_roman_numeral(text):
            """Check if text is a valid Roman numeral"""
            import re

            roman_pattern = r"^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$"
            return bool(re.match(roman_pattern, text.upper()))

        def is_numbered_unit(element):
            """Check if an xUnit element is a numbered list item"""
            if (
                element.tag == "xUnit"
                and element.get("xIsTitle", "false").lower() == "false"
                and element.get("xType") == "none"
            ):
                x_name = element.find("xName")
                x_text = element.find("xText")

                if (
                    x_name is not None
                    and x_text is not None
                    and x_name.text
                    and x_text.text
                ):
                    name_text = x_name.text.strip()
                    # Check if it's a number (with or without suffix)
                    if name_text.isdigit() or (
                        name_text.endswith(".") and name_text[:-1].isdigit()
                    ):
                        return True
                    # Check if it's a Roman numeral (with or without suffix)
                    clean_name = name_text.rstrip(".")
                    if is_roman_numeral(clean_name):
                        return True
            return False

        def is_roman_list(elements):
            """Check if a sequence of elements forms a Roman numeral list"""
            if not elements:
                return False

            for element in elements:
                if not is_numbered_unit(element):
                    return False
                x_name = element.find("xName")
                if x_name is not None and x_name.text:
                    name_text = x_name.text.strip().rstrip(".")
                    if not is_roman_numeral(name_text):
                        return False
                else:
                    return False
            return True

        def process_text_content(element, level=0):
            """Process mixed text content with inline elements"""
            content = []

            # Add initial text
            if element.text:
                content.append(element.text)

            # Process child elements
            for child in element:
                if child.tag == "xBx":
                    # Bold text
                    child_content = process_text_content(child, level + 1)
                    content.append(f"<strong>{''.join(child_content)}</strong>")
                elif child.tag == "xIx":
                    # Italic text
                    child_content = process_text_content(child, level + 1)
                    content.append(f"<em>{''.join(child_content)}</em>")
                elif child.tag == "xUx":
                    # Underlined text
                    child_content = process_text_content(child, level + 1)
                    content.append(f"<u>{''.join(child_content)}</u>")
                elif child.tag == "xBRx":
                    # Line break
                    content.append("<br>")
                elif child.tag == "xSUPx":
                    # Superscript
                    child_content = process_text_content(child, level + 1)
                    content.append(f"<sup>{''.join(child_content)}</sup>")
                elif child.tag == "xAnon":
                    # Anonymized content
                    child_content = process_text_content(child, level + 1)
                    content.append(
                        f'<span class="anonymized">{"".join(child_content)}</span>'
                    )
                elif child.tag == "xLexLink":
                    # Legal reference
                    child_content = process_text_content(child, level + 1)
                    title_attr = (
                        f' title="{child.get("xTitle")}"' if child.get("xTitle") else ""
                    )
                    content.append(
                        f'<span class="legal-reference"{title_attr}>{"".join(child_content)}</span>'
                    )
                else:
                    # Other elements - process recursively
                    child_result = process_element(child, level + 1)
                    content.extend(child_result)

                # Add tail text
                if child.tail:
                    content.append(child.tail)

            return content

        def process_elements(elements, level=0):
            """Process a list of elements, converting numbered units to lists"""
            result = []
            i = 0

            while i < len(elements):
                element = elements[i]

                # Check if this starts a sequence of numbered units
                if is_numbered_unit(element):
                    # Collect consecutive numbered units
                    list_items = []
                    j = i

                    while j < len(elements) and is_numbered_unit(elements[j]):
                        current_element = elements[j]
                        x_text = current_element.find("xText")
                        if x_text is not None and x_text.text:
                            # Process the text content for inline formatting
                            item_content = process_text_content(x_text, level + 1)
                            list_items.append("".join(item_content))
                        j += 1

                    # Check if this is a Roman numeral list
                    consecutive_elements = elements[i:j]
                    if is_roman_list(consecutive_elements):
                        # Create ordered list with Roman numerals
                        result.append('<ol class="roman-list">')
                        for item_text in list_items:
                            result.append(f"<li>{item_text}</li>")
                        result.append("</ol>")
                    else:
                        # Create regular ordered list
                        result.append("<ol>")
                        for item_text in list_items:
                            result.append(f"<li>{item_text}</li>")
                        result.append("</ol>")

                    i = j  # Skip processed elements
                elif element.tag == "xEnum":
                    # Handle bullet point lists
                    result.extend(process_element(element, level))
                    i += 1
                else:
                    # Process single element normally
                    result.extend(process_element(element, level))
                    i += 1

            return result

        def process_element(element, level=0):
            result = []

            # Handle different element types
            if element.tag == "xName":
                if element.text:
                    content = process_text_content(element, level)
                    result.append(
                        f'<div class="element-xname">{"".join(content)}</div>'
                    )

            elif element.tag == "xTitle":
                if element.text:
                    content = process_text_content(element, level)
                    result.append(f'<div class="title">{"".join(content)}</div>')

            elif element.tag == "xText":
                # FIXED: Check if there's any content (direct text OR child elements)
                has_content = (element.text and element.text.strip()) or len(
                    element
                ) > 0

                if has_content:
                    classes = []
                    if element.get("xBold") == "true":
                        classes.append("bold")
                    if element.get("xALIGNx") == "right":
                        classes.append("right-align")
                    elif element.get("xALIGNx") == "center":
                        classes.append("center-align")

                    class_attr = f' class="{" ".join(classes)}"' if classes else ""

                    # Process text content with inline formatting
                    content = process_text_content(element, level)
                    content_text = "".join(content)
                    if content_text.strip():  # Only add if there's actual content
                        result.append(f"<p{class_attr}>{content_text}</p>")
                else:
                    # Truly empty text element creates spacing
                    result.append('<div class="empty-line"></div>')

            elif element.tag == "xEnum":
                # Handle enumeration lists (bullet points)
                result.append('<ul class="bullet-list">')
                for child in element:
                    if child.tag == "xEnumElem":
                        content = process_text_content(child, level + 1)
                        result.append(f"<li>{''.join(content)}</li>")
                result.append("</ul>")

            elif element.tag == "xBx":
                # Bold text (when standalone)
                content = process_text_content(element, level)
                result.append(f"<strong>{''.join(content)}</strong>")

            elif element.tag == "xIx":
                # Italic text (when standalone)
                content = process_text_content(element, level)
                result.append(f"<em>{''.join(content)}</em>")

            elif element.tag == "xUx":
                # Underlined text (when standalone)
                content = process_text_content(element, level)
                result.append(f"<u>{''.join(content)}</u>")

            elif element.tag == "xBRx":
                # Line break
                result.append("<br>")

            elif element.tag == "xLexLink":
                # Handle legal reference links
                content = process_text_content(element, level)
                title_attr = (
                    f' title="{element.get("xTitle")}"' if element.get("xTitle") else ""
                )
                result.append(
                    f'<span class="legal-reference"{title_attr}>{"".join(content)}</span>'
                )

            elif element.tag == "xSUPx":
                # Handle superscript elements
                content = process_text_content(element, level)
                result.append(f"<sup>{''.join(content)}</sup>")

            elif element.tag == "xAnon":
                # Handle anonymized content
                content = process_text_content(element, level)
                result.append(f'<span class="anonymized">{"".join(content)}</span>')

            elif element.tag == "xUnit":
                # Skip processing if this is a numbered unit (handled by process_elements)
                if is_numbered_unit(element):
                    return result

                unit_classes = []
                if element.get("xBold") == "true":
                    unit_classes.append("bold")
                if element.get("xIsTitle") == "true":
                    unit_classes.append("title")

                class_attr = (
                    f' class="{" ".join(unit_classes)}"' if unit_classes else ""
                )
                result.append(f"<div{class_attr}>")

                # Process children using process_elements to handle nested numbered lists
                result.extend(process_elements(list(element), level + 1))

                result.append("</div>")

            # IMPROVED TABLE HANDLING
            elif element.tag == "xRows":
                result.append('<table class="table">')

                # First, check if there's a xCOLGROUPx and process it for column widths
                colgroup_element = None
                for child in element:
                    if child.tag == "xCOLGROUPx":
                        colgroup_element = child
                        break

                if colgroup_element is not None:
                    # Add colgroup with column definitions to preserve layout
                    result.append("<colgroup>")
                    for col_child in colgroup_element:
                        if col_child.tag == "xCOLx":
                            width = col_child.get("xWIDTHx")
                            if width:
                                # Convert width to percentage for better responsive design
                                result.append(f'<col style="width: {width}px;">')
                            else:
                                result.append("<col>")
                    result.append("</colgroup>")

                # Process table rows (skip xCOLGROUPx elements)
                for child in element:
                    if child.tag != "xCOLGROUPx":
                        result.extend(process_element(child, level + 1))

                result.append("</table>")

            elif element.tag == "xRow":
                result.append("<tr>")
                # Only process xClmn children to avoid processing unexpected elements
                for child in element:
                    if child.tag == "xClmn":
                        result.extend(process_element(child, level + 1))
                result.append("</tr>")

            elif element.tag == "xClmn":
                # Enhanced column processing with better styling
                align = element.get("xALIGNx", "left")
                valign = element.get("xVALIGNx", "top")

                # Build style string with proper formatting
                style_parts = [
                    f"text-align: {align}",
                    f"vertical-align: {valign}",
                    "padding: 8px 12px",  # Better padding for readability
                ]

                style = "; ".join(style_parts) + ";"
                result.append(f'<td style="{style}">')

                # Process children using process_elements to handle nested content properly
                result.extend(process_elements(list(element), level + 1))

                result.append("</td>")

            # Ignore xCOLGROUPx and xCOLx as they're handled in xRows
            elif element.tag in ["xCOLGROUPx", "xCOLx"]:
                pass  # These are handled in the xRows processing

            elif element.tag == "xBlock":
                result.append('<div class="section">')
                # Process children using process_elements to handle nested numbered lists
                result.extend(process_elements(list(element), level + 1))
                result.append("</div>")

            else:
                # Default handling for other elements - check if they have text content
                if element.text and element.text.strip():
                    content = process_text_content(element, level)
                    result.append(
                        f'<div class="element-{element.tag.lower()}">{"".join(content)}</div>'
                    )
                else:
                    # Process children if no direct text content
                    result.extend(process_elements(list(element), level + 1))

            return result

        # Process all root children using the enhanced process_elements function
        html_parts.extend(process_elements(list(root)))

        html_parts.append("</body>")
        html_parts.append("</html>")

        return "\n".join(html_parts)

    except ET.ParseError as e:
        return f"<html><body><h1>XML Parse Error</h1><p>Error parsing XML: {e}</p></body></html>"
    except Exception as e:
        return f"<html><body><h1>Conversion Error</h1><p>Error converting XML to HTML: {e}</p></body></html>"
