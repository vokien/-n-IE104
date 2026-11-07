import re
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

class Robots(RobotFileParser):
    """Wildcard/end anchors and longest-match rules from RFC 9309 section 2.2."""
    def parse(self, lines):
        super().parse(lines)
        self.groups = []
        agents, rules, delays = [], [], []
        directives = False
        for line in lines:
            line = line.split("#", 1)[0].strip()
            key, colon, value = line.partition(":")
            if not colon:
                continue
            key, value = key.strip().lower(), value.strip()
            if key == "user-agent":
                if directives:
                    self.groups.append((agents, rules, delays))
                    agents, rules, delays, directives = [], [], [], False
                agents.append(value.casefold())
            elif agents and key in {"allow", "disallow"}:
                directives = True
                if value:
                    rules.append((value, key == "allow"))
            elif agents and key == "crawl-delay":
                directives = True
                try:
                    delays.append(float(value))
                except ValueError:
                    pass
        if agents:
            self.groups.append((agents, rules, delays))

    def selected(self, useragent):
        product = useragent.split("/", 1)[0].casefold()
        explicit = [g for g in self.groups if product in g[0]]
        return explicit or [g for g in self.groups if "*" in g[0]]

    @staticmethod
    def normalized(value):
        from urllib.parse import quote
        value = quote(value, safe="/:?=&!$'()*+,;@[]%~-._")
        def octet(match):
            c = chr(int(match[1], 16))
            return c if c.isascii() and (c.isalnum() or c in "-._~") else match[0].upper()
        return re.sub(r"%([0-9a-fA-F]{2})", octet, value)

    def can_fetch(self, useragent, url):
        p = urlsplit(url)
        path = self.normalized(p.path or "/") + (("?" + self.normalized(p.query)) if p.query else "")
        matches = []
        for _, rules, _ in self.selected(useragent):
            for pattern, allowed in rules:
                normalized = self.normalized(pattern)
                end = normalized.endswith("$")
                if end:
                    normalized = normalized[:-1]
                regex = "^" + ".*".join(re.escape(part) for part in normalized.split("*")) + ("$" if end else "")
                if re.search(regex, path):
                    matches.append((len(normalized.replace("*", "").encode("utf-8")), allowed))
        return max(matches)[1] if matches else True

    def crawl_delay(self, useragent):
        return max((d for _, _, delays in self.selected(useragent) for d in delays), default=0)

