import argparse
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET

DEFAULT_URL = "https://geoservicios.entrerios.gov.ar/geoserver/ows?service=WMS&request=GetCapabilities"
DEFAULT_KEYWORDS = ["corufa", "perfor", "laborat", "bianchi", "cfi"]
DEFAULT_TIMEOUT = 30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search WMS GetCapabilities layers by keyword.",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="GetCapabilities URL.",
    )
    parser.add_argument(
        "--keywords",
        default=",".join(DEFAULT_KEYWORDS),
        help="Comma-separated keywords used to match Name/Title.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format.",
    )
    return parser.parse_args()


def clean_tag(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def parse_keywords(raw: str) -> list[str]:
    values = [v.strip().lower() for v in raw.split(",")]
    return [v for v in values if v]


def fetch_xml(url: str, timeout: int) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def collect_layers(root: ET.Element, keywords: list[str]) -> list[dict[str, str]]:
    matches: list[dict[str, str]] = []

    def traverse(node: ET.Element) -> None:
        if clean_tag(node.tag) == "Layer":
            name = ""
            title = ""
            for child in node:
                child_name = clean_tag(child.tag)
                if child_name == "Name":
                    name = child.text or ""
                elif child_name == "Title":
                    title = child.text or ""

            if name:
                searchable = f"{name}\n{title}".lower()
                if any(keyword in searchable for keyword in keywords):
                    prefix = name.split(":", 1)[0] if ":" in name else ""
                    matches.append({
                        "name": name,
                        "title": title,
                        "prefix": prefix,
                    })

        for child in node:
            traverse(child)

    traverse(root)
    return matches


def print_text(matches: list[dict[str, str]], keywords: list[str], url: str) -> None:
    print(f"URL: {url}")
    print(f"Keywords: {', '.join(keywords)}")
    print(f"Found {len(matches)} matching layers")
    print("=" * 60)
    for layer in matches:
        not_geonode = "Yes" if layer["prefix"].lower() != "geonode" else "No"
        print(f"Name: {layer['name']}")
        print(f"Title: {layer['title']}")
        print(f"Not geonode namespace?: {not_geonode} (prefix: {layer['prefix']!r})")
        print("-" * 60)


def print_json(matches: list[dict[str, str]], keywords: list[str], url: str) -> None:
    payload = {
        "url": url,
        "keywords": keywords,
        "count": len(matches),
        "layers": matches,
    }
    print(json.dumps(payload, ensure_ascii=True, indent=2))


def main() -> int:
    args = parse_args()
    keywords = parse_keywords(args.keywords)
    if not keywords:
        print("No valid keywords provided", file=sys.stderr)
        return 2

    try:
        xml_data = fetch_xml(args.url, args.timeout)
    except Exception as error:
        print(f"Error fetching URL: {error}", file=sys.stderr)
        return 1

    try:
        root = ET.fromstring(xml_data)
    except Exception as error:
        print(f"Error parsing XML: {error}", file=sys.stderr)
        return 1

    matches = collect_layers(root, keywords)

    if args.format == "json":
        print_json(matches, keywords, args.url)
    else:
        print_text(matches, keywords, args.url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
