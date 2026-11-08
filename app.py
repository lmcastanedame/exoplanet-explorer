import json
import math
from urllib.parse import urlencode
from urllib.request import urlopen

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
NASA_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
NASA_QUERY = """
select top 20 pl_name,discoverymethod,disc_year,pl_rade,pl_orbper
from pscomppars
where pl_rade > 0 and pl_orbper > 0 and disc_year is not null
and hostname in ('TRAPPIST-1','Kepler-186','Kepler-11',
                'HD 209458','51 Peg','HD 189733')
order by pl_name
"""


def load_planets():
    # Request JSON directly from NASA; nothing is saved to disk or cached.
    parameters = urlencode({"query": NASA_QUERY, "format": "json"})
    try:
        with urlopen(f"{NASA_URL}?{parameters}", timeout=10) as response:
            data = json.load(response)
        planets = []
        for row in data:
            planets.append({
                "name": row["pl_name"],
                "method": row["discoverymethod"],
                "year": int(row["disc_year"]),
                "radius": float(row["pl_rade"]),
                "period": float(row["pl_orbper"]),
            })
        if not planets or any(
            not math.isfinite(p[key]) or p[key] <= 0
            for p in planets for key in ("radius", "period")
        ):
            raise ValueError("Missing or invalid NASA measurements.")
        return planets
    except (OSError, ValueError, TypeError, KeyError) as exception:
        app.logger.warning("NASA API request failed: %s", exception)
        raise RuntimeError("NASA data is unavailable right now. Please try again shortly.") from exception


def filter_planets(planets):
    method = request.args.get("method", "")
    radius_text = request.args.get("max_radius", "").strip()
    max_radius = None
    if radius_text:
        try:
            max_radius = float(radius_text)
        except ValueError:
            raise ValueError("Enter a positive number for maximum radius.")
        if not math.isfinite(max_radius) or max_radius <= 0:
            raise ValueError("Enter a positive number for maximum radius.")
    return [
        planet for planet in planets
        if (not method or planet["method"] == method)
        and (max_radius is None or planet["radius"] <= max_radius)
    ]


@app.get("/")
def index():
    planets = []
    filtered = []
    error = ""
    status_code = 200
    try:
        planets = load_planets()
        filtered = filter_planets(planets)
    except ValueError as exception:
        error = str(exception)
        status_code = 400
    except RuntimeError as exception:
        error = str(exception)
        status_code = 502
    return render_template(
        "index.html",
        planets=filtered,
        methods=sorted({planet["method"] for planet in planets}) or ["Radial Velocity", "Transit"],
        selected_method=request.args.get("method", ""),
        max_radius=request.args.get("max_radius", ""),
        total=len(planets),
        chart_max_period=math.ceil(max((p["period"] for p in planets), default=1)),
        chart_max_radius=math.ceil(max((p["radius"] for p in planets), default=1)),
        error=error,
    ), status_code


@app.get("/api/planets")
def planet_data():
    try:
        planets = filter_planets(load_planets())
    except ValueError as exception:
        return jsonify({"error": str(exception)}), 400
    except RuntimeError as exception:
        return jsonify({"error": str(exception)}), 502
    return jsonify(planets)


if __name__ == "__main__":
    app.run()
