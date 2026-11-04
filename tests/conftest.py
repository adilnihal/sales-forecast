import os
import tempfile

# Throwaway SQLite file so tests never touch real data. Must run before the app is imported.
# Set PYTEST_USE_ENV_DB=1 to run the same tests against the DATABASE_URL you provide (e.g. PostgreSQL).
if not os.getenv("PYTEST_USE_ENV_DB"):
    _tmp = tempfile.mkdtemp()
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ.pop("ANTHROPIC_API_KEY", None)
