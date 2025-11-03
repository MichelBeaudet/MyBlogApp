import argparse, json, sys, re, urllib.parse
import requests
from bs4 import BeautifulSoup

DEF_TIMEOUT = 20

import cloudscraper
from urllib.parse import urldefrag

# create one scraper (reuses cookies, headers)
_scraper = cloudscraper.create_scraper(
    browser={"browser": "chrome", "platform": "windows", "mobile": False}
)

def get(url: str, timeout: int = 20):
    # remove URL fragment (#...) which servers never see
    url, _ = urldefrag(url)

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

    resp = _scraper.get(url, headers=headers, timeout=timeout, allow_redirects=True)
    resp.raise_for_status()   # will raise if still blocked
    return resp

def grade_from_score(s:int)->str:
    if s>=90: return "A"
    if s>=80: return "B"
    if s>=70: return "C"
    if s>=60: return "D"
    return "F"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    args = ap.parse_args()

    url = args.url
    r = get(url)
    headers = {k.lower(): v for k,v in r.headers.items()}
    html = r.text
    soup = BeautifulSoup(html, "lxml")

    # Checks
    checks = {}
    checks["https"] = url.lower().startswith("https://")
    checks["hsts"] = bool(headers.get("strict-transport-security"))
    checks["x_content_type_options"] = headers.get("x-content-type-options","").lower() == "nosniff"
    checks["x_frame_options"] = headers.get("x-frame-options") is not None
    checks["referrer_policy"] = headers.get("referrer-policy") is not None
    checks["permissions_policy"] = headers.get("permissions-policy") is not None or headers.get("feature-policy") is not None

    # CSP presence
    csp = headers.get("content-security-policy")
    checks["csp"] = csp is not None and len(csp)>0

    # Mixed content: look for http:// subresources on https pages
    mixed = False
    if checks["https"]:
        for tag in soup.find_all(["script","link","img","iframe","video","audio","source"]):
            for attr in ["src","href","data","poster"]:
                val = tag.get(attr)
                if val and isinstance(val,str) and val.lower().startswith("http://"):
                    mixed = True
                    break
            if mixed: break
    checks["mixed_content"] = mixed

    # Forms: ensure actions are https (or relative)
    forms_https = True
    for f in soup.find_all("form"):
        action = (f.get("action") or "").strip()
        if action.lower().startswith("http://"):
            forms_https = False
            break
    checks["forms_https"] = forms_https

    # Third-party scripts & SRI
    third_party = 0
    sri_missing = 0
    page_host = urllib.parse.urlparse(r.url).netloc
    for s in soup.find_all("script"):
        src = s.get("src")
        if not src: 
            continue
        u = urllib.parse.urlparse(urllib.parse.urljoin(r.url, src))
        if u.netloc and u.netloc != page_host:
            third_party += 1
        if u.scheme in ("http","https") and not s.get("integrity"):
            sri_missing += 1
    checks["third_party_scripts"] = third_party
    checks["sri_missing"] = sri_missing

    # Score weights (simple defaults, can be overridden by server env if you want)
    weights = {"csp":30,"hsts":15,"https":10,"xfo":8,"xcto":8,"referrer":4,"perm":5,"mixed":10,"forms":5,"sri":5}
    score = 0
    # Positive points
    score += (weights["https"] if checks["https"] else 0)
    score += (weights["hsts"] if checks["hsts"] else 0)
    score += (weights["xfo"] if checks["x_frame_options"] else 0)
    score += (weights["xcto"] if checks["x_content_type_options"] else 0)
    score += (weights["referrer"] if checks["referrer_policy"] else 0)
    score += (weights["perm"] if checks["permissions_policy"] else 0)
    score += (weights["sri"] if not checks["sri_missing"] else 0)  # only if all have SRI

    # Penalties
    if not checks["csp"]: score -= weights["csp"]
    if checks["mixed_content"]: score -= weights["mixed"]
    if not checks["forms_https"]: score -= weights["forms"]

    # Normalize 0..100
    score = max(0, min(100, score))
    grade = grade_from_score(score)

    issues = []
    if not checks["csp"]:
        issues.append({"id":"CSP_MISSING","severity":"high","title":"No Content-Security-Policy","recommendation":"Add a strict CSP with script-src, object-src, base-uri, frame-ancestors."})
    if not checks["hsts"] and checks["https"]:
        issues.append({"id":"HSTS_MISSING","severity":"medium","title":"No HSTS header","recommendation":"Enable Strict-Transport-Security with a long max-age and preload if suitable."})
    if checks["mixed_content"]:
        issues.append({"id":"MIXED_CONTENT","severity":"high","title":"Mixed content detected","recommendation":"Serve all subresources over HTTPS or use protocol-relative/relative URLs."})
    if not checks["forms_https"]:
        issues.append({"id":"FORM_INSECURE","severity":"medium","title":"Form action over HTTP","recommendation":"Use HTTPS endpoints or relative actions."})
    if checks["sri_missing"]:
        issues.append({"id":"SRI_MISSING","severity":"low","title":"External scripts without SRI","recommendation":"Use Subresource Integrity (integrity=...) for CDN scripts."})

    out = {
        "score": score,
        "grade": grade,
        "issues": issues,
        "checks": {
            "https": checks["https"],
            "hsts": checks["hsts"],
            "x_content_type_options": checks["x_content_type_options"],
            "x_frame_options": checks["x_frame_options"],
            "referrer_policy": checks["referrer_policy"],
            "permissions_policy": checks["permissions_policy"],
            "csp": checks["csp"],
            "mixed_content": checks["mixed_content"],
            "forms_https": checks["forms_https"],
            "third_party_scripts": checks["third_party_scripts"],
            "sri_missing": checks["sri_missing"],
        },
        "rawHeaders": {k:v for k,v in headers.items() if k in [
            "server","content-security-policy","strict-transport-security","x-frame-options",
            "x-content-type-options","referrer-policy","permissions-policy"
        ]}
    }
    print(json.dumps(out))
    sys.exit(0)

if __name__ == "__main__":
    main()
