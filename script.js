import typer
import requests
from typing import List
from enum import Enum

# --- CONFIGURATION ---
HARDCODED_TOKEN = "YOUR_X_SAP_LOGON_TOKEN_HERE"

app = typer.Typer(help="SAP BusinessObjects Query Generator with Folder Recursion")

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

def execute_cms_query(base_url, query):
    url = f"{base_url}/cmsquery"
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SAP-LogonToken': HARDCODED_TOKEN
    }
    try:
        response = requests.post(url, headers=headers, json={"query": query})
        response.raise_for_status()
        return response.json().get('entries', [])
    except Exception as e:
        typer.secho(f"API Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)

def get_all_descendants(base_url, parent_cuids: List[str]):
    """Recursively fetches child CUIDs using the API."""
    all_found_cuids = set()
    to_process = list(parent_cuids)
    
    while to_process:
        formatted_list = ", ".join([f"'{c}'" for c in to_process])
        query = f"SELECT SI_CUID, SI_KIND FROM CI_INFOOBJECTS WHERE SI_PARENT_CUID IN ({formatted_list})"
        
        children = execute_cms_query(base_url, query)
        to_process = []
        
        for child in children:
            cuid = child.get('SI_CUID')
            kind = child.get('SI_KIND')
            
            if cuid and cuid not in all_found_cuids:
                all_found_cuids.add(cuid)
                if kind == 'Folder':
                    to_process.append(cuid)
                    
    return list(all_found_cuids)

@app.command()
def generate(
    env: str = typer.Option(..., help="dev, qa, or prod"),
    obj_type: ObjectType = typer.Option(..., "--type", help="Object category"),
    cuids: List[str] = typer.Argument(..., help="The actual CUID strings")
):
    """
    Generates the CMS Query. If type is Folder, it crawls children via API first.
    """
    base_url = get_env_url(env)
    final_list = list(cuids)

    # If it's a folder, we MUST use the API to find the children
    if obj_type == ObjectType.Folders:
        # Note: We don't print anything here to keep the output clean
        descendants = get_all_descendants(base_url, cuids)
        final_list = list(set(final_list + descendants))

    # Format the final list for the query
    formatted_cuids = ", ".join([f"'{c.strip()}'" for c in final_list])

    # The single output required
    query = (
        f"SELECT * FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS "
        f"WHERE SI_CUID IN ({formatted_cuids})"
    )

    typer.echo(query)

if __name__ == "__main__":
    app()
