/**
 * Samiksha Analytics Tracker
 *
 * How to use: Add this to any page on your website:
 *   <script src="https://skshm-cyber.github.io/samiksha-analytics/tracker.js"></script>
 *
 * It will automatically:
 *   1. Identify the visitor (using localStorage)
 *   2. Identify the session (using sessionStorage)
 *   3. Collect device + page (+ UTM campaign) information
 *   4. Send a tracking request to the backend
 *   5. Track scroll depth, scroll milestones and time on page
 *   6. Auto-detect button clicks, form submits, external links, file downloads
 *   7. Emit SEMANTIC events so you can answer "which pricing card did they click":
 *      - pricing_card_click → reading card selected (name, category, price…)
 *      - cta_click          → booking action (WhatsApp / subscribe / any CTA)
 *      - section_view       → user reached a named pricing section
 *      - scroll_milestone   → 25% / 50% / 75% / 100%
 *
 * Optional: add data-* attributes to pricing cards for perfect metadata:
 *   <div data-plan data-name="Detailed Yes/No" data-category="Individual"
 *        data-price="111" data-currency="INR" data-duration="6 cards" data-badge="">
 * Without them the tracker derives the card from its heading + price heuristics.
 */

(function () {
    "use strict";

    // =======================================================================
    // CONFIGURATION
    // =======================================================================
    // The backend URL where tracking data is sent.
    // Set window.SAMIKSHA_API_URL before loading this script to override.
    var API_BASE = window.SAMIKSHA_API_URL
        || "https://samiksha-analytics1.tewarisaksham20.workers.dev";

    // =======================================================================
    // SELF-TRACKING EXCLUSION
    // =======================================================================
    // The analytics dashboard/github-pages itself also loads tracker.js. Skip
    // so dashboard views never pollute your real traffic stats.
    function shouldSkipTracking() {
        if (window.SAMIKSHA_SKIP_TRACKING) return true;
        var host = window.location.hostname || "";
        if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return true;
        var path = window.location.pathname || "";
        if (path.indexOf("samiksha-analytics") !== -1) return true;
        if (path.indexOf("samiksha_analytics") !== -1) return true;
        return false;
    }

    if (shouldSkipTracking()) return;

    // =======================================================================
    // HELPER: UUID v4
    // =======================================================================
    function generateId() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // =======================================================================
    // 1. IDENTIFY VISITOR + SESSION
    // =======================================================================
    var visitorId = localStorage.getItem("analytics_visitor_id");
    if (!visitorId) {
        visitorId = generateId();
        localStorage.setItem("analytics_visitor_id", visitorId);
    }

    var sessionId = sessionStorage.getItem("analytics_session_id");
    if (!sessionId) {
        sessionId = generateId();
        sessionStorage.setItem("analytics_session_id", sessionId);
    }

    var isFirstVisit = 0;
    if (!localStorage.getItem("analytics_visited")) {
        isFirstVisit = 1;
        localStorage.setItem("analytics_visited", "1");
    }

    // =======================================================================
    // 2. BROWSER / DEVICE DETECTION
    // =======================================================================
    function detectBrowser(s) {
        if (s.indexOf("Edg/") !== -1) return { name: "Edge", version: s.split("Edg/")[1].split(" ")[0] };
        if (s.indexOf("OPR/") !== -1 || s.indexOf("Opera") !== -1) return { name: "Opera", version: (s.split("OPR/")[1] || "").split(" ")[0] };
        if (s.indexOf("Chrome/") !== -1 && s.indexOf("Safari/") !== -1) return { name: "Chrome", version: s.split("Chrome/")[1].split(" ")[0] };
        if (s.indexOf("Firefox/") !== -1) return { name: "Firefox", version: s.split("Firefox/")[1].split(" ")[0] };
        if (s.indexOf("Safari/") !== -1) return { name: "Safari", version: s.split("Version/")[1].split(" ")[0] };
        return { name: "Unknown", version: "" };
    }

    function detectOS(sa) {
        if (sa.indexOf("Win") !== -1) return "Windows";
        if (sa.indexOf("Mac") !== -1) return "macOS";
        if (sa.indexOf("Linux") !== -1) return "Linux";
        if (sa.indexOf("Android") !== -1) return "Android";
        if (sa.indexOf("iPhone") !== -1 || sa.indexOf("iPad") !== -1) return "iOS";
        return "Unknown";
    }

    function detectDeviceType() {
        var w = screen.width;
        var su = navigator.userAgent.toLowerCase();
        if (/mobile|android|iphone/i.test(su)) return "Mobile";
        if (/ipad|tablet/i.test(su)) return "Tablet";
        if (w < 768) return "Mobile";
        if (w < 1024) return "Tablet";
        return "Desktop";
    }

    var ua = navigator.userAgent;
    var browser = detectBrowser(ua);
    var os = detectOS(ua);
    var deviceType = detectDeviceType();

    // =======================================================================
    // 3. UTM CAMPAIGN PARAMS (Instagram / Facebook / Google Ads)
    // =======================================================================
    function getUtmParam(key) {
        try { return new URLSearchParams(window.location.search).get(key) || ""; }
        catch (e) { return ""; }
    }
    var utm = {
        utm_source: getUtmParam("utm_source"),
        utm_medium: getUtmParam("utm_medium"),
        utm_campaign: getUtmParam("utm_campaign"),
        utm_content: getUtmParam("utm_content"),
    };

    // =======================================================================
    // 4. PAGE LOAD DATA
    // =======================================================================
    var visitData = {
        visitor_id: visitorId,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        timezone: "",
        language: navigator.language || "",
        browser: browser.name,
        browser_version: browser.version,
        os: os,
        device_type: deviceType,
        screen_width: screen.width,
        screen_height: screen.height,
        page_url: window.location.href,
        referrer: document.referrer || "",
        page_title: document.title || "",
        is_first_visit: isFirstVisit,
        scroll_percentage: 0,
        time_on_page: 0,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_content: utm.utm_content,
    };

    try {
        visitData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {}

    var pageLoadTime = Date.now();

    // =======================================================================
    // 5. DELIVERY HELPER (sendBeacon with fetch fallback)
    // =======================================================================
    function sendJson(url, data) {
        var payload = JSON.stringify(data);
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, payload);
        } else {
            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true,
            });
        }
    }

    sendJson(API_BASE + "/api/track", visitData);

    // =======================================================================
    // 6. EVENT SENDING — with structured `properties`
    // =======================================================================
    function sendEvent(eventType, eventTarget, extraProps) {
        sendJson(API_BASE + "/api/event", {
            visitor_id: visitorId,
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            event_type: eventType,
            event_target: eventTarget || "",
            page_url: window.location.href,
            properties: extraProps || {},
        });
    }

    function cleanText(s) {
        return String(s == null ? "" : s).replace(/\s+/g, " ").trim().substring(0, 200);
    }

    // =======================================================================
    // 7. SEMANTIC PRICING-CARD DETECTION
    // =======================================================================
    var INR_RE = /(?:₹|Rs\.?)\s*([0-9][0-9,]*)/i;
    var USD_RE = /\$\s*([0-9][0-9.,]*)/i;

    function parsePrice(text) {
        var m = text.match(INR_RE) || text.match(USD_RE);
        if (!m) return { value: null, currency: null };
        var value = parseFloat(m[1].replace(/,/g, "").replace(/\.00$/, ""));
        if (isNaN(value)) return { value: null, currency: null };
        return { value: value, currency: m[0].indexOf("$") === 0 ? "USD" : "INR" };
    }

    var SECTION_CATEGORY = {
        individual: "Individual",
        guidance: "Guidance",
        messages: "Messages",
        love: "Love & Connection",
        combos: "Premium Combos",
        healing: "Healing",
        sessions: "Live Sessions",
        subscriptions: "Subscriptions",
        pricing: "Pricing",
    };

    /** Nearest ancestor whose id/data-section maps to a known category. */
    function sectionCategory(el) {
        var node = el;
        while (node && node.nodeType === 1) {
            var id = node.id || (node.getAttribute ? node.getAttribute("data-section") : "") || "";
            var key = String(id).toLowerCase();
            if (SECTION_CATEGORY[key]) return SECTION_CATEGORY[key];
            node = node.parentNode;
        }
        return "";
    }

    /** Best-effort structured metadata for a clicked element inside a card. */
    function cardMeta(el) {
        var node = el;
        while (node && node.nodeType === 1 && node !== document.body) {
            if (node.getAttribute && (node.getAttribute("data-plan") || node.getAttribute("data-reading"))) {
                var headingEl = node.querySelector ? node.querySelector("h1,h2,h3,h4,h5,h6,.plan-name") : null;
                var full = cleanText(node.textContent);
                var p = parsePrice(full);
                var explicitPrice = node.getAttribute("data-price");
                return {
                    name: node.getAttribute("data-name")
                        || cleanText(headingEl ? headingEl.textContent : "")
                        || full.split(" ").slice(0, 6).join(" "),
                    category: node.getAttribute("data-category") || sectionCategory(node),
                    price: explicitPrice !== "" && explicitPrice != null ? Number(explicitPrice) : p.value,
                    currency: node.getAttribute("data-currency")
                        || (explicitPrice != null && explicitPrice !== "" ? (parsePrice(full).currency || "INR") : (p.currency || "INR")),
                    duration: node.getAttribute("data-duration") || "",
                    badge: node.getAttribute("data-badge") || "",
                };
            }
            if (node.querySelector) {
                var headings = node.querySelectorAll("h1,h2,h3,h4,h5,h6");
                var text = cleanText(node.textContent || "");
                var price = parsePrice(text);
                if (headings.length > 0 && price.value !== null && text.length > 4) {
                    return {
                        name: cleanText(headings[0].textContent),
                        category: sectionCategory(node),
                        price: price.value,
                        currency: price.currency,
                        duration: "",
                        badge: "",
                    };
                }
            }
            node = node.parentNode;
        }
        return null;
    }

    /** Extract the plan name from a wa.me prefilled text param. */
    function whatsAppPlan(href) {
        var idx = href.indexOf("text=");
        if (idx === -1) return "";
        try {
            var text = decodeURIComponent(href.substring(idx + 5)).replace(/\+/g, " ");
            var m = text.match(/interested in the ([^.$,]+)/i);
            return m ? cleanText(m[1]) : "";
        } catch (e) { return ""; }
    }

    function isWhatsAppHref(href) {
        return href && (href.indexOf("wa.me") !== -1 || href.indexOf("api.whatsapp.com") !== -1);
    }

    var BOOK_RE = /\b(book|subscribe|order|start|enquir|buy|get now|book now|contact me|sign up)\b/i;

    // =======================================================================
    // 8. CLICK TRACKING — buttons, links, pricing cards, CTAs
    // =======================================================================
    document.addEventListener("click", function (e) {
        var target = e.target.nodeType === 1 ? e.target : (e.target.parentElement || e.target);

        // ── WhatsApp / external booking links ──────────────────────────────
        var link = target.closest ? target.closest("a") : null;
        if (link) {
            var href = link.href || "";
            if (isWhatsAppHref(href)) {
                var card = cardMeta(link);
                sendEvent("cta_click", href, {
                    target: "whatsapp",
                    plan: whatsAppPlan(href) || (card && card.name) || "",
                    url: href,
                    price: card ? card.price : null,
                    currency: card ? card.currency : null,
                });
                return;
            }
            if (href.indexOf("http") === 0) {
                try {
                    if (new URL(href).hostname !== window.location.hostname) {
                        sendEvent("link_click", href);
                        return;
                    }
                } catch (err) {}
            }
            var exts = [".pdf", ".zip", ".doc", ".docx", ".csv", ".xlsx", ".txt", ".rar", ".exe", ".dmg"];
            var lh = href.toLowerCase();
            for (var i = 0; i < exts.length; i++) {
                if (lh.indexOf(exts[i]) !== -1) { sendEvent("file_download", href); return; }
            }
        }

        // ── Pricing card click (semantic) ───────────────────────────────────
        var card = cardMeta(target);
        var clickedText = cleanText(target.textContent || "");
        var isBooking = BOOK_RE.test(clickedText) && clickedText.length < 80;
        if (card && card.name) {
            if (isBooking) {
                sendEvent("cta_click", card.name, {
                    target: "card-cta",
                    plan: card.name,
                    price: card.price,
                    currency: card.currency,
                });
            } else {
                sendEvent("pricing_card_click", card.name, {
                    name: card.name,
                    category: card.category,
                    price: card.price,
                    currency: card.currency,
                    duration: card.duration,
                    badge: card.badge,
                });
            }
            return;
        }

        // ── Fallback: plain button / role=button ───────────────────────────
        var tag = (target.tagName || "").toLowerCase();
        var role = target.getAttribute ? (target.getAttribute("role") || "") : "";
        if (tag === "button" || role === "button") {
            sendEvent("button_click", cleanText(target.textContent || ""));
        }
    }, { passive: true });

    // =======================================================================
    // 9. FORM SUBMITS (e.g. the WhatsApp enquiry form on the pricing page)
    // =======================================================================
    document.addEventListener("submit", function (e) {
        var form = e.target;
        var action = form.action || form.getAttribute("action") || window.location.href;
        var props = { action: action };
        try {
            var urgent = form.querySelector('[name="urgent"], [name="urgent_reading"], input[type="checkbox"]');
            if (urgent) props.urgent = urgent.checked ? "yes" : "no";
        } catch (err) {}
        sendEvent("form_submit", action, props);
    }, { passive: true });

    // =======================================================================
    // 10. SCROLL DEPTH + MILESTONES + TIME ON PAGE
    // =======================================================================
    var maxScrollPercent = 0;
    var milestonesSent = {};

    function scrollPercent() {
        var top = window.pageYOffset || document.documentElement.scrollTop;
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return 100;
        return Math.round((top / docHeight) * 100);
    }

    window.addEventListener("scroll", function () {
        var cur = scrollPercent();
        if (cur > maxScrollPercent) maxScrollPercent = cur;
        [25, 50, 75, 100].forEach(function (m) {
            if (cur >= m && !milestonesSent[m]) {
                milestonesSent[m] = true;
                sendEvent("scroll_milestone", m + "%", { depth: m });
            }
        });
    }, { passive: true });

    window.addEventListener("beforeunload", function () {
        var timeOnPage = (Date.now() - pageLoadTime) / 1000;
        var finalScroll = scrollPercent();
        if (finalScroll > maxScrollPercent) maxScrollPercent = finalScroll;
        sendJson(API_BASE + "/api/event", {
            visitor_id: visitorId,
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            event_type: "page_leave",
            event_target: "",
            page_url: window.location.href,
            time_on_page: Math.round(timeOnPage * 10) / 10,
            scroll_percentage: maxScrollPercent,
        });
    });

    // =======================================================================
    // 11. SECTION VIEWS — pricing sub-areas (IntersectionObserver)
    // =======================================================================
    var sectionSent = {};
    var sectionObserver = null;
    function observeSections() {
        if (typeof IntersectionObserver === "undefined" || sectionObserver) return;
        try {
            sectionObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var node = entry.target;
                    var key = String(node.id || (node.getAttribute && node.getAttribute("data-section")) || "").toLowerCase();
                    var cat = SECTION_CATEGORY[key];
                    if (cat && !sectionSent[key]) {
                        sectionSent[key] = true;
                        sendEvent("section_view", key, {
                            name: key,
                            category: cat,
                            url: window.location.href,
                        });
                    }
                });
            }, { threshold: 0.25 });
            document.querySelectorAll("[id], [data-section]").forEach(function (node) {
                var key = String(node.id || (node.getAttribute && node.getAttribute("data-section")) || "").toLowerCase();
                if (SECTION_CATEGORY[key]) sectionObserver.observe(node);
            });
        } catch (e) {}
    }
    observeSections();

})();