#!/usr/bin/env python
"""Test script to verify database schema with new tables."""

from database import Base, engine, OddsHistory, EdgeAnalysis
import sqlite3

# Create tables
Base.metadata.create_all(bind=engine)
print("✓ Database tables created successfully")

# Verify tables exist
conn = sqlite3.connect('nba_cache.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = cursor.fetchall()

print("\nTables in database:")
for t in tables:
    print(f"  - {t[0]}")

# Check OddsHistory schema
print("\nOddsHistory columns:")
cursor.execute("PRAGMA table_info(odds_history)")
columns = cursor.fetchall()
for col in columns:
    col_id, col_name, col_type, notnull, default, pk = col
    print(f"  - {col_name}: {col_type}")

# Check EdgeAnalysis schema
print("\nEdgeAnalysis columns:")
cursor.execute("PRAGMA table_info(edge_analysis)")
columns = cursor.fetchall()
for col in columns:
    col_id, col_name, col_type, notnull, default, pk = col
    print(f"  - {col_name}: {col_type}")

conn.close()
print("\n✓ Schema verification complete")
