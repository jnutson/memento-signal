"""Local synthetic-only fixture for the customer workspace browser checks."""
import tempfile
from pathlib import Path
import uvicorn
from memento.api import create_app
from tests.core_fixture import core_fixture

def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--port",type=int,default=8122)
    args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="memento-core-ui-") as directory:
        root=Path(directory).resolve()
        release=core_fixture(root)
        app=create_app(root)
        @app.get("/test-release")
        def test_release(): return {"release":release.name}
        uvicorn.run(app,host="127.0.0.1",port=args.port,log_level="warning")

if __name__=="__main__": main()
