async function loadPartial(targetSelector, partialPath) {
    const target = document.querySelector(targetSelector);
    if (!target) {
        return;
    }

    try {
        const response = await fetch(partialPath, { cache: "no-cache" });
        if (!response.ok) {
            return;
        }
        target.innerHTML = await response.text();
    } catch (_) {
        // Keep page functional even when partials are missing.
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadPartial("#site-header", "partials/header.html");
    loadPartial("#site-footer", "partials/footer.html");
});
