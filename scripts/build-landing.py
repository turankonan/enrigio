#!/usr/bin/env python3
"""Build landing/ from the designer's HTML exports.

Usage (from the repo root):
    python3 -I scripts/build-landing.py <TR export .zip or folder> <EN export .zip or folder>

The design tool exports a reference mockup that cannot be served as is. Each
build re-applies the production changes on top of the new export:
  - absolute asset paths, so /en/ shares the root's runtime and assets
  - the TR/EN switch pointing at / and /en/
  - the raw template hidden until the runtime renders it
  - the small 72px engine logos instead of the 2560px design originals
  - logo <img> templates that the browser would otherwise fetch literally
  - the favicon, the TR page title and the EN footer logo link
  - the early-access and contact forms posting to the Google Sheet

Every replacement asserts that its anchor occurs exactly once, so an export
whose markup changed fails loudly instead of shipping half-patched.
"""

import os
import re
import shutil
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANDING = os.path.join(ROOT, "landing")

# Apps Script web app behind the waitlist; source in scripts/landing-waitlist.gs.
WAITLIST_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbzC02mcN89AMZ4_zmAHk5BLBSh0G9y77WUxbrPBammbmnQuCOHiAkrogfmkOXx-LHJfbw/exec"
)

ENGINE_LOGOS = {
    "./assets/cc6734529b631a839bd3344ee74f6525.webp": "/logos/chatgpt.png",
    "./assets/d2a6eea2ec1a4ed2985638033830190b.webp": "/logos/gemini.png",
    "./assets/f6135a33cae191c939f77dd7b12dab1c.webp": "/logos/claude.png",
    "./assets/1672888c25a4a1016403fedee7734d86.png": "/logos/perplexity.png",
}

RUNTIME_FILES = [
    "support.js",
    "vendor/react.js",
    "vendor/react-dom.js",
    "ds/enrigio/tokens.css",
    "ds/enrigio/components/bundle.css",
    "ds/enrigio/components/bundle.js",
]

PAGES = {
    "tr": {
        "source": "LandingNext.dc.html",
        "target": "index.html",
        "title": "Enrigio — AI visibility for your brand",
        "signup": "Listeye katıl",
        "contact": "Görüşme talebi gönder",
        "sending": "Gönderiliyor…",
        "fail": "Şu anda gönderemedik, lütfen birkaç dakika sonra tekrar deneyin.",
    },
    "en": {
        "source": "LandingNextEN.dc.html",
        "target": "en/index.html",
        "title": None,
        "signup": "Join the list",
        "contact": "Request a call",
        "sending": "Sending…",
        "fail": "We couldn't send this right now. Please try again in a few minutes.",
    },
}

HEAD_STYLE = (
    "<style>x-dc{display:none}"
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}"
    ".form-err{margin:0;text-align:center;font-size:14px;line-height:20px;"
    "font-weight:600;color:var(--danger)}.form-err:empty{display:none}"
    ".cta:disabled{opacity:.6;cursor:progress}</style>"
)


def js_string(value):
    if "'" in value and '"' not in value:
        return '"' + value.replace("\\", "\\\\") + '"'
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def honeypot(kind):
    return (
        f'<input class="hp" id="hp-{kind}" type="text" name="company_url" '
        'tabindex="-1" autocomplete="off" aria-hidden="true">'
    )


def send_form_method(lang, fail):
    return (
        "  componentDidMount() { this.loadedAt = Date.now(); this.run(); }\n"
        "  sendForm(kind, fields, onOk) {\n"
        "    var self = this;\n"
        "    if (self.state.sending) return;\n"
        "    var hp = document.getElementById('hp-' + kind);\n"
        f"    var payload = Object.assign({{ kind: kind, lang: '{lang}', "
        "company_url: hp ? hp.value : '', "
        "elapsed_ms: Date.now() - (self.loadedAt || Date.now()) }, fields);\n"
        "    self.setState({ sending: true, formErr: '' });\n"
        "    // text/plain keeps this a simple request; Apps Script cannot answer a CORS preflight.\n"
        "    fetch(WAITLIST_URL, { method: 'POST', body: JSON.stringify(payload) })\n"
        "      .then(function (r) { return r.json(); })\n"
        "      .then(function (d) { if (!d || !d.ok) throw new Error('rejected'); "
        "self.setState({ sending: false }); onOk(); })\n"
        f"      .catch(function () {{ self.setState({{ sending: false, formErr: {js_string(fail)} }}); }});\n"
        "  }"
    )


def build_page(src_dir, lang, page):
    with open(os.path.join(src_dir, page["source"]), encoding="utf-8") as f:
        html = f.read()

    def replace(old, new):
        nonlocal html
        count = html.count(old)
        if count != 1:
            sys.exit(f"{page['source']}: expected 1 match, found {count}:\n  {old[:120]}")
        html = html.replace(old, new)

    for name in ["vendor/react.js", "vendor/react-dom.js", "support.js"]:
        replace(f'<script src="./{name}">', f'<script src="/{name}">')
    replace('href="ds/enrigio/tokens.css"', 'href="/ds/enrigio/tokens.css"')
    replace('href="ds/enrigio/components/bundle.css"', 'href="/ds/enrigio/components/bundle.css"')
    replace('src="ds/enrigio/components/bundle.js"', 'src="/ds/enrigio/components/bundle.js"')

    replace('"default":"LandingNext.dc.html"', '"default":"/"')
    replace('"default":"LandingNextEN.dc.html"', '"default":"/en/"')
    replace("this.props.trUrl || 'LandingNext.dc.html'", "this.props.trUrl || '/'")
    replace("this.props.enUrl || 'LandingNextEN.dc.html'", "this.props.enUrl || '/en/'")

    for design_logo, small_logo in ENGINE_LOGOS.items():
        replace(design_logo, small_logo)
    html = html.replace('src="./assets/', 'src="/assets/')
    html = re.sub(r'(<img\b[^>]*?)\bsrc="\{\{', r'\1sc-camel-src="{{', html)

    replace(
        '<head>\n<meta charset="utf-8">',
        f'<head>\n<meta charset="utf-8">\n{HEAD_STYLE}\n<link rel="icon" href="/favicon.ico">',
    )
    if page["title"]:
        html, count = re.subn(r"<title>.*?</title>", f"<title>{page['title']}</title>", html)
        if count != 1:
            sys.exit(f"{page['source']}: expected one <title>")
    if lang == "en":
        replace(
            '<a href="https://www.enrigio.com" aria-label="Enrigio home (www.enrigio.com)"',
            '<a href="https://www.enrigio.com/en/" aria-label="Enrigio home (www.enrigio.com/en)"',
        )

    for kind, handler, label in [
        ("signup", "submitSignup", "signupLabel"),
        ("contact", "submitContact", "contactLabel"),
    ]:
        replace(
            f'<button type="button" class="cta" style="width: 100%" onClick="{{{{{handler}}}}}">'
            f"{page[kind]}</button>",
            f"{honeypot(kind)}\n"
            f'<button type="button" class="cta" style="width: 100%" onClick="{{{{{handler}}}}}" '
            f'disabled="{{{{sending}}}}">{{{{{label}}}}}</button>\n'
            '<p class="form-err" role="alert">{{formErr}}</p>',
        )
    replace("cErr: {}, screen: 'landing',", "cErr: {}, sending: false, formErr: '', screen: 'landing',")
    replace("  componentDidMount() { this.run(); }", send_form_method(lang, page["fail"]))
    replace(
        "  goTo(patch) { this.setState(patch); this.toTop(); }",
        "  goTo(patch) { this.setState(Object.assign({ formErr: '' }, patch)); this.toTop(); }",
    )
    replace("var ENGINES = [", f"var WAITLIST_URL = {js_string(WAITLIST_URL)};\nvar ENGINES = [")
    replace(
        "        self.setState({ contactDone: true, cErr: {} });",
        "        self.setState({ cErr: {} });\n"
        "        self.sendForm('contact', { name: v('name'), email: v('email'), company: v('company'), "
        "phone: v('phone'), scope: v('scope'), note: v('note') }, "
        "function () { self.setState({ contactDone: true }); });",
    )
    replace(
        "        self.setState({ done: true, siteErr: '', emailErr: '', site: st });",
        "        self.setState({ siteErr: '', emailErr: '', site: st });\n"
        "        self.sendForm('signup', { site: st, email: em }, "
        "function () { self.setState({ done: true }); });",
    )
    replace(
        "      done: s.done, notDone: !s.done,",
        "      done: s.done, notDone: !s.done, sending: s.sending, formErr: s.formErr,\n"
        f"      signupLabel: s.sending ? {js_string(page['sending'])} : {js_string(page['signup'])}, "
        f"contactLabel: s.sending ? {js_string(page['sending'])} : {js_string(page['contact'])},",
    )

    for leftover in ["LandingNext", "./assets/", 'src="ds/']:
        if leftover in html:
            sys.exit(f"{page['source']}: unrewritten reference to {leftover!r}")

    target = os.path.join(LANDING, page["target"])
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"wrote landing/{page['target']}")


def open_export(path, workdir, name):
    if os.path.isdir(path):
        return path
    out = os.path.join(workdir, name)
    os.makedirs(out)
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            dest = os.path.realpath(os.path.join(out, member.filename))
            if not dest.startswith(os.path.realpath(out) + os.sep):
                sys.exit(f"{path}: refusing to extract {member.filename!r} outside the folder")
        archive.extractall(out)
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with tempfile.TemporaryDirectory() as workdir:
        tr_dir = open_export(sys.argv[1], workdir, "tr")
        en_dir = open_export(sys.argv[2], workdir, "en")
        for lang, src_dir in [("tr", tr_dir), ("en", en_dir)]:
            if not os.path.isfile(os.path.join(src_dir, PAGES[lang]["source"])):
                sys.exit(f"{sys.argv[1 if lang == 'tr' else 2]}: no {PAGES[lang]['source']} inside")
            build_page(src_dir, lang, PAGES[lang])

        for name in RUNTIME_FILES:
            target = os.path.join(LANDING, name)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copyfile(os.path.join(tr_dir, name), target)

        skipped = {os.path.basename(p) for p in ENGINE_LOGOS}
        os.makedirs(os.path.join(LANDING, "assets"), exist_ok=True)
        for asset in sorted(os.listdir(os.path.join(tr_dir, "assets"))):
            if asset not in skipped:
                shutil.copyfile(os.path.join(tr_dir, "assets", asset), os.path.join(LANDING, "assets", asset))
    print("done; review with git diff, then deploy with:")
    print("  sudo rsync -a --delete landing/ /var/www/enrigio/ && sudo chown -R root:root /var/www/enrigio")


if __name__ == "__main__":
    main()
