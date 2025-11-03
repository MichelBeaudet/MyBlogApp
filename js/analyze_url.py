import argparse, json, re, sys, os, urllib.parse
from bs4 import BeautifulSoup
import requests

DEF_TIMEOUT = 20
import cloudscraper

def fetch_url(url: str, timeout: int = 20):
    scraper = cloudscraper.create_scraper(
        browser={
            "browser": "chrome",
            "platform": "windows",
            "mobile": False,
        }
    )
    # Optional: custom headers
    headers = {
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/126.0.0.0 Safari/537.36"),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    resp = scraper.get(url, headers=headers, timeout=timeout, allow_redirects=True)
    resp.raise_for_status()
    return resp

def load_html_from_file(path:str)->str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def guess_version_from_url(src:str):
    if not src: return None
    # Try to capture semver in filenames query strings
    m = re.search(r'(?:(?:-|@|/)(\d+\.\d+\.\d+))|(?:v=(\d+\.\d+\.\d+))', src)
    if m:
        return m.group(1) or m.group(2)
    return None

def detect_components(soup:BeautifulSoup, base_url:str, fp_db:dict):
    components = []
    evidence_map = {}

    def add_hit(key, lib_name, v, homepage, ev, ctype):
        k = (lib_name, v, homepage, ctype)
        if k not in evidence_map:
            evidence_map[k] = []
        evidence_map[k].append(ev)

    # scripts
    for tag in soup.find_all("script"):
        src = tag.get("src","") or ""
        text = tag.get_text() or ""
        blob = src + " " + text[:200]
        for key, meta in fp_db.items():
            for pat in meta["patterns"]:
                if pat.lower() in blob.lower():
                    ver = guess_version_from_url(src)
                    add_hit(key, meta["lib_name"], ver, meta.get("homepage"), f"script:{src or '[inline]'} contains {pat}", meta["type"])

    # links
    for tag in soup.find_all("link"):
        href = tag.get("href","") or ""
        for key, meta in fp_db.items():
            for pat in meta["patterns"]:
                if pat.lower() in href.lower():
                    ver = guess_version_from_url(href)
                    add_hit(key, meta["lib_name"], ver, meta.get("homepage"), f"link:{href} contains {pat}", meta["type"])

    # meta generator hints
    for tag in soup.find_all("meta"):
        name = (tag.get("name") or tag.get("property") or "").lower()
        content = (tag.get("content") or "").lower()
        if name == "generator":
            if "wordpress" in content:
                add_hit("wordpress","wordpress", None, "https://wordpress.org/", "meta:generator=WordPress", "cms")
            if "next.js" in content or "nextjs" in content:
                add_hit("nextjs","next", None, "https://nextjs.org/", "meta:generator=Next.js", "framework")

    # Collate
    out = []
    for (lib_name, ver, homepage, ctype), evs in evidence_map.items():
        out.append({
            "name": lib_name.capitalize() if lib_name else "unknown",
            "type": ctype or "library",
            "lib_name": lib_name,
            "version": ver,
            "homepage": homepage,
            "evidence": evs,
            "risk_flags": ["no-sri"] if any("cdn" in e.lower() for e in evs) else []
        })
    return out

def extract_structure(soup:BeautifulSoup):
    meta = {"og": False, "twitter": False}
    for m in soup.find_all("meta"):
        p = (m.get("property") or "").lower()
        n = (m.get("name") or "").lower()
        if p.startswith("og:"): meta["og"] = True
        if n.startswith("twitter:"): meta["twitter"] = True
    return {
        "doctype": "html5",
        "scripts": len(soup.find_all('script')),
        "styles": len(soup.find_all('link', rel=lambda x: x and 'stylesheet' in x)),
        "forms": len(soup.find_all('form')),
        "iframes": len(soup.find_all('iframe')),
        "meta": meta
    }

def summarize(components, structure):
    bits = []
    libs = [c["lib_name"] for c in components]
    if "react" in libs: bits.append("React SPA")
    if "vue" in libs: bits.append("Vue/Nuxt app")
    if "angular" in libs: bits.append("Angular app")
    if "bootstrap" in libs: bits.append("Bootstrap CSS")
    if "tailwindcss" in libs: bits.append("Tailwind CSS")
    if "ga4" in libs or "google-tag-manager" in libs: bits.append("Analytics enabled")
    if structure["forms"]>0: bits.append(f"{structure['forms']} forms")
    if structure["iframes"]>0: bits.append(f"{structure['iframes']} iframes")
    if structure["meta"].get("og"): bits.append("OpenGraph meta")
    if structure["meta"].get("twitter"): bits.append("Twitter meta")
    return "; ".join(bits) or "Simple static page"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url")
    parser.add_argument("--file")
    parser.add_argument("--depth", type=int, default=0)
    args = parser.parse_args()

    if not args.url and not args.file:
        print(json.dumps({"error":"--url or --file required"}))
        sys.exit(1)

    if args.url:
        resp = fetch_url(args.url)
        html = resp.text
        base_url = resp.url
    else:
        html = load_html_from_file(args.file)
        base_url = "file://" + os.path.abspath(args.file)

    soup = BeautifulSoup(html, "lxml")
    with open(os.path.join(os.path.dirname(__file__), "fingerprint_db.json"), "r", encoding="utf-8") as f:
        fp_db = json.load(f)

    components = detect_components(soup, base_url, fp_db)
    structure = extract_structure(soup)
    summary = summarize(components, structure)

    out = {
        "components": components,
        "structure": structure,
        "summary": summary,
        "notes": []
    }
    print(json.dumps(out))
    sys.exit(0)

if __name__ == "__main__":
    main()
