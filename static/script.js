const form = document.querySelector("#filter-form");
const rows = document.querySelector("#planet-rows");
const statusMessage = document.querySelector("#status");
const chart = document.querySelector("#planet-chart");
const points = document.querySelector("#chart-points");
const submitButton = form.querySelector("button[type='submit']");
const svgNamespace = "http://www.w3.org/2000/svg";
let activeRequest = null;

document.querySelector(".reset-link").addEventListener("click", (event) => {
    event.preventDefault();
    // Clear explicitly: form.reset() would restore server-rendered filter values.
    form.elements.method.value = "";
    form.elements.max_radius.value = "";
    form.requestSubmit();
});

function updateTable(planets) {
    rows.replaceChildren();
    for (const planet of planets) {
        const row = document.createElement("tr");
        const values = [planet.name, planet.year, planet.method,
            planet.radius.toFixed(2), planet.period.toFixed(2)];
        values.forEach((value, index) => {
            const cell = document.createElement(index === 0 ? "th" : "td");
            if (index === 0) cell.scope = "row";
            cell.textContent = value;
            row.append(cell);
        });
        rows.append(row);
    }
    if (planets.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = "No planets to display. Try changing the filters.";
        row.append(cell);
        rows.append(row);
    }
}

function updateChart(planets) {
    // Live measurements can change; expand the axes when needed.
    chart.dataset.maxPeriod = Math.ceil(Math.max(Number(chart.dataset.maxPeriod), ...planets.map(p => p.period)));
    chart.dataset.maxRadius = Math.ceil(Math.max(Number(chart.dataset.maxRadius), ...planets.map(p => p.radius)));
    document.querySelector("#chart-max-period").textContent = chart.dataset.maxPeriod;
    document.querySelector("#chart-max-radius").textContent = chart.dataset.maxRadius;
    points.replaceChildren();
    for (const planet of planets) {
        const circle = document.createElementNS(svgNamespace, "circle");
        circle.setAttribute("cx", 70 + planet.period / Number(chart.dataset.maxPeriod) * 680);
        circle.setAttribute("cy", 260 - planet.radius / Number(chart.dataset.maxRadius) * 220);
        circle.setAttribute("r", 5);
        const title = document.createElementNS(svgNamespace, "title");
        title.textContent = `${planet.name}: ${planet.period} days, ${planet.radius} Earth radii`;
        circle.append(title);
        points.append(circle);
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // A reset or another submission replaces any request still in progress.
    if (activeRequest) activeRequest.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const parameters = new URLSearchParams(new FormData(form));
    submitButton.disabled = true;
    statusMessage.textContent = "Loading planets…";
    try {
        const response = await fetch(`/api/planets?${parameters}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error || "Could not load planets.");
        updateTable(data);
        updateChart(data);
        statusMessage.textContent = `Showing ${data.length} planets.`;
    } catch (error) {
        if (controller.signal.aborted) return;
        statusMessage.textContent = `${error.message} Previous results are still shown. Try again.`;
    } finally {
        if (activeRequest === controller) {
            submitButton.disabled = false;
            activeRequest = null;
        }
    }
});
