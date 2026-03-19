# Player Props Edge - NBA Analytics Dashboard (v2)

A modern, highly-responsive NBA prop betting and player analytics dashboard. This version features a dedicated **Python FastAPI backend** for advanced analytics, local caching via SQLite, and a React frontend built with Vite and TailwindCSS v4.

## Features

- **Automated Prop Engine**: Recommends high-confidence player props based on historical hit rates.
- **Matchup Context**: Dynamically analyzes opponent defensive rankings and pace adjustments.
- **Advanced Consistency Scoring**: Uses standard deviation and variance to track player reliability.
- **Persistent Caching**: Background scheduler (APScheduler) pre-warms data and caches results in a local SQLite database (`nba_cache.db`).
- **Interactive Visualizations**: Recharts-powered trend analysis for Points, Rebounds, Assists, and 3PT.

## Technology Stack

- **Frontend**: React 19, Vite, TailwindCSS v4, Axios, Recharts.
- **Backend**: FastAPI, uvicorn, nba_api, SQLAlchemy, pandas.
- **Database**: SQLite (SQLAlchemy ORM).

## How to Run This

To run the full application, you need to start both the backend and the frontend.

### 1. Start the Backend (FastAPI)

1. Open a new terminal and navigate to the backend folder:
   ```bash
   cd e:/NBA/backend
   ```
2. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   ```
3. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the API server:
   ```bash
   uvicorn app:app --reload
   ```
   *The backend will be running at `http://localhost:8000`.*

### 2. Start the Frontend (Vite)

1. Open another terminal and navigate to the root folder:
   ```bash
   cd e:/NBA
   ```
2. Install the Node dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the URL provided (default: `http://localhost:5173`).

---

## Configuration

The application is configured to automatically connect to the local backend. If the backend is not running, the frontend will fallback to generating realistic mock data for demonstration purposes.

*Note: The first search for a player may take a moment as the backend fetches and caches data from the official NBA API.*
