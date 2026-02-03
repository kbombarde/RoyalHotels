import typer
from typing import List
from enum import Enum

# --- CONFIGURATION ---
HARDCODED_TOKEN = "YOUR_X_SAP_LOGON_TOKEN_HERE"

app = typer.Typer(help="SAP BusinessObjects Query Generator")

class ObjectType(str, Enum):
    Reports = "Reports"
    Connections = "Connections"
    Universes = "Universes"
    Folders = "Folders"

def get_env_url(env_name: str) -> str:
    env_name = env_name.lower()
    switcher = {
        "dev": "http://dev-bo-server:6405/biprws/v1",
        "qa": "http://qa-bo-server:6405/biprws/v1",
        "prod": "http://prod-bo-server:6405/biprws/v1"
    }
    url = switcher.get(env_name)
    if not url:
        typer.secho(f"Error: Environment '{env_name}' not found.", fg=typer.colors.RED)
        raise typer.Exit(1)
    return url

@app.command()
def generate(
    env: str = typer.Option(..., help="dev, qa, or prod"),
    obj_type: ObjectType = typer.Option(..., "--type", help="Object category"),
    cuids: List[str] = typer.Argument(..., help="The actual CUID strings")
):
    """
    Generates the CMS Query for the provided CUIDs.
    """
    # Verify environment exists (even if not executing, just to validate)
    get_env_url(env)

    # Format CUIDs: wrap each in single quotes and join with commas
    # This ensures 'fetch' or other command words aren't accidentally included
    formatted_cuids = ", ".join([f"'{c.strip()}'" for c in cuids])

    # Construct the query
    query = (
        f"SELECT * FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS "
        f"WHERE SI_CUID IN ({formatted_cuids})"
    )

    # Output only the query
    typer.secho("\n--- GENERATED CMS QUERY ---", fg=typer.colors.BRIGHT_RED, bold=True)
    typer.echo(query)
    typer.echo("")

if __name__ == "__main__":
    app()
