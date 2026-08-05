/**
 * Samiksha Analytics Tracker
 * 
 * How to use: Add this to any page on your website:
 *   <script src="https://skshm-cyber.github.io/samiksha-analytics/tracker.js"></script>
 * 
 * It will automatically:
 *   1. Identify the visitor (using localStorage)
 *   2. Identify the session (using sessionStorage)
 *   3. Collect device and page information
 *   4. Send a tracking request to the backend
 *   5. Track scroll depth and time on page
 *   6. Auto-detect button clicks, form submits, external links, file downloads
 */

(function () {
    "use strict";

    // =======================================================================
    // CONFIGURATION
    // =======================================================================
    // The backend URL where tracking data is sent.
    // Set window.SAMIKSHA_API_URL before loading this script to override.
    // Example: <script>window.SAMIKSHA_API_URL = "https://abc123.ngrok.io";</script>
    var API_BASE = window.SAMIKSHA_API_URL
        || "https://samiksha-analytics1.tewarisaksham20.workers.dev";

    // =======================================================================
    // HELPER: Generate a random ID (UUID v4)
    // =======================================================================
    function generateId() {
        // Creates a string like "a3f1b2c4-5d6e-7f80-9abc-def012345678"
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // =======================================================================
    // 1. VISITOR ID — persisted in localStorage (survives browser restarts)
    // =======================================================================
    var visitorId = localStorage.getItem("analytics_visitor_id");
    if (!visitorId) {
        visitorId = generateId();
        localStorage.setItem("analytics_visitor_id", visitorId);
    }

    // =======================================================================
    // 2. SESSION ID — persisted in sessionStorage (resets when tab closes)
    // =======================================================================
    var sessionId = sessionStorage.getItem("analytics_session_id");
    if (!sessionId) {
        sessionId = generateId();
        sessionStorage.setItem("analytics_session_id", sessionId);
    }

    // =======================================================================
    // 3. FIRST VISIT CHECK
    // =======================================================================
    var isFirstVisit = 0;
    if (!localStorage.getItem("analytics_visited")) {
        isFirstVisit = 1;
        localStorage.setItem("analytics_visited", "1");
    }

    // =======================================================================
    // 4. BROWSER DETECTION
    // =======================================================================
    // We parse the userAgent string to figure out what browser and OS the
    // visitor is using. This isn't 100% accurate, but good enough for
    // basic analytics.
    function detectBrowser(ua) {
        // Order matters: some browsers include other browser names in their UA.
        // We check more specific ones first.
        if (ua.indexOf("Edg/") !== -1) {
            // Microsoft Edge (uses Chromium engine)
            return { name: "Edge", version: ua.split("Edg/")[1].split(" ")[0] };
        } else if (ua.indexOf("OPR/") !== -1 || ua.indexOf("Opera") !== -1) {
            return { name: "Opera", version: (ua.split("OPR/")[1] || "").split(" ")[0] };
        } else if (ua.indexOf("Chrome/") !== -1 && ua.indexOf("Safari/") !== -1) {
            return { name: "Chrome", version: ua.split("Chrome/")[1].split(" ")[0] };
        } else if (ua.indexOf("Firefox/") !== -1) {
            return { name: "Firefox", version: ua.split("Firefox/")[1].split(" ")[0] };
        } else if (ua.indexOf("Safari/") !== -1) {
            return { name: "Safari", version: ua.split("Version/")[1].split(" ")[0] };
        }
        return { name: "Unknown", version: "" };
    }

    function detectOS(ua) {
        if (ua.indexOf("Win") !== -1) return "Windows";
        if (ua.indexOf("Mac") !== -1) return "macOS";
        if (ua.indexOf("Linux") !== -1) return "Linux";
        if (ua.indexOf("Android") !== -1) return "Android";
        if (ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1) return "iOS";
        return "Unknown";
    }

    function detectDeviceType() {
        var width = screen.width;
        var ua = navigator.userAgent.toLowerCase();
        // Mobile phones typically have screens narrower than 768px
        // Tablets are often between 768px and 1024px
        if (/mobile|android|iphone/i.test(ua)) return "Mobile";
        if (/ipad|tablet/i.test(ua)) return "Tablet";
        if (width < 768) return "Mobile";
        if (width < 1024) return "Tablet";
        return "Desktop";
    }

    var ua = navigator.userAgent;
    var browser = detectBrowser(ua);
    var os = detectOS(ua);
    var deviceType = detectDeviceType();

    // =======================================================================
    // 5. PAGE LOAD DATA — collected immediately when the script runs
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
    };

    // Try to get the visitor's timezone
    try {
        visitData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
        // If the browser doesn't support Intl, leave it empty
    }

    // Record the time the page loaded (for calculating time_on_page later)
    var pageLoadTime = Date.now();

    // =======================================================================
    // 6. SEND VISIT DATA to POST /api/track
    // =======================================================================
    // We use navigator.sendBeacon if available, because it survives page
    // navigation better than fetch(). Falls back to fetch() if not available.
    function sendVisitData() {
        var payload = JSON.stringify(visitData);
        if (navigator.sendBeacon) {
            navigator.sendBeacon(API_BASE + "/api/track", payload);
        } else {
            fetch(API_BASE + "/api/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
            });
        }
    }

    // Send the visit data right away
    sendVisitData();

    // =======================================================================
    // 7. SCROLL DEPTH TRACKING
    // =======================================================================
    // We listen for the scroll event and calculate what percentage of the
    // page the user has scrolled through. We keep the MAXIMUM value because
    // scrolling up shouldn't reduce the score.
    var maxScrollPercent = 0;

    function calculateScrollPercent() {
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return 100; // Page fits on screen, so it's 100%
        return Math.round((scrollTop / docHeight) * 100);
    }

    window.addEventListener("scroll", function () {
        var current = calculateScrollPercent();
        if (current > maxScrollPercent) {
            maxScrollPercent = current;
        }
    }, { passive: true });

    // =======================================================================
    // 8. TIME ON PAGE + FINAL SCROLL — sent on page leave (beforeunload)
    // =======================================================================
    window.addEventListener("beforeunload", function () {
        var timeOnPage = (Date.now() - pageLoadTime) / 1000; // Convert ms to seconds
        var finalScroll = calculateScrollPercent();
        if (finalScroll > maxScrollPercent) {
            maxScrollPercent = finalScroll;
        }

        var leaveData = {
            visitor_id: visitorId,
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            event_type: "page_leave",
            event_target: "",
            page_url: window.location.href,
            time_on_page: Math.round(timeOnPage * 10) / 10, // 1 decimal place
            scroll_percentage: maxScrollPercent,
        };

        // We send this as a regular fetch with keepalive so it survives page unload
        var payload = JSON.stringify(leaveData);
        if (navigator.sendBeacon) {
            // Send visit update (with final scroll and time) via a separate beacon to /api/track
            // We also send the page_leave event to /api/event
            navigator.sendBeacon(API_BASE + "/api/event", JSON.stringify({
                visitor_id: visitorId,
                session_id: sessionId,
                timestamp: new Date().toISOString(),
                event_type: "page_leave",
                event_target: "",
                page_url: window.location.href,
            }));
        }
    });

    // =======================================================================
    // 9. AUTO-DETECT INTERACTIONS
    // =======================================================================

    // 9a. BUTTON CLICKS — any <button> or elements with role="button"
    document.addEventListener("click", function (e) {
        var target = e.target;

        // Walk up the DOM to find if this click was on a button or link
        while (target && target !== document) {
            var tag = target.tagName.toLowerCase();
            var role = target.getAttribute("role") || "";

            if (tag === "button" || role === "button") {
                sendEvent("button_click", target.textContent.trim().substring(0, 100));
                return;
            }

            // 9c. EXTERNAL LINKS — <a> tags pointing to a different domain
            if (tag === "a") {
                var href = target.href || "";
                if (href && href.indexOf("http") === 0) {
                    var linkDomain = new URL(href).hostname;
                    var currentDomain = window.location.hostname;
                    if (linkDomain !== currentDomain) {
                        sendEvent("link_click", href);
                        return;
                    }
                }

                // 9d. FILE DOWNLOADS — <a> tags linking to downloadable files
                var fileExtensions = [".pdf", ".zip", ".doc", ".docx", ".csv", ".xlsx", ".txt", ".rar", ".exe", ".dmg"];
                var lowerHref = (target.href || "").toLowerCase();
                for (var i = 0; i < fileExtensions.length; i++) {
                    if (lowerHref.indexOf(fileExtensions[i]) !== -1) {
                        sendEvent("file_download", href);
                        return;
                    }
                }
            }

            target = target.parentNode;
        }
    }, { passive: true });

    // 9b. FORM SUBMITS
    document.addEventListener("submit", function (e) {
        var form = e.target;
        var formAction = form.action || form.getAttribute("action") || window.location.href;
        sendEvent("form_submit", formAction);
    }, { passive: true });

    // Helper: send an event to POST /api/event
    function sendEvent(eventType, eventTarget) {
        var eventData = {
            visitor_id: visitorId,
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            event_type: eventType,
            event_target: eventTarget,
            page_url: window.location.href,
        };
        var payload = JSON.stringify(eventData);
        if (navigator.sendBeacon) {
            navigator.sendBeacon(API_BASE + "/api/event", payload);
        } else {
            fetch(API_BASE + "/api/event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
            });
        }
    }

})();
