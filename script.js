import typer
import requests
import json
from typing import List
from enum import Enum

# --- CONFIGURATION ---
# 1. Token hardcoded as requested
HARDCODED_TOKEN = "YOUR_X_SAP_LOGON_TOKEN_HERE"

app = typer.Typer(help="SAP BusinessObjects Metadata Explorer")

class ObjectType(str, Enum):
    Reports = "Reports"
    Connections = "Connections"
    Universes = "Universes"
    Folders = "Folders"

# 2. Environment Switch Case Logic
def get_env_url(env_name: str) -> str:
    """
    Returns the base URL based on the environment name.
    """
    env_name = env_name.lower()
    
    # Switch-case implementation using a dictionary
    switcher = {
        "dev": "http://dev-bo-server:6405/biprws/v1",
        "qa": "http://qa-bo-server:6405/biprws/v1",
        "prod": "http://prod-bo-server:6405/biprws/v1"
    }
    
    url = switcher.get(env_name)
    
    if not url:
        typer.secho(f"Error: Environment '{env_name}' is not defined.", fg=typer.colors.RED)
        raise typer.Exit(code=1)
        
    return url

def execute_cms_query(base_url, query):
    url = f"{base_url}/cmsquery"
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SAP-LogonToken': HARDCODED_TOKEN
    }
    response = requests.post(url, headers=headers, json={"query": query})
    response.raise_for_status()
    return response.json().get('entries', [])

def get_all_descendants(base_url, parent_cuids: List[str]):
    """Recursively finds all children and grandchildren CUIDs."""
    all_found_cuids = set()
    to_process = list(parent_cuids)
    
    while to_process:
        formatted_list = ",".join([f"'{c}'" for c in to_process])
        # Only querying for children of the current batch
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
def fetch(
    env: str = typer.Option(..., help="Environment name (e.g., dev, qa, prod)"),
    obj_type: ObjectType = typer.Option(..., "--type", help="Type of objects to query"),
    cuids: List[str] = typer.Argument(..., help="List of CUIDs to process")
):
    """
    Fetch SAP BO metadata. Performs recursive lookup for Folders.
    """
    # Set base URL via switch case method
    base_url = get_env_url(env)
    
    final_cuid_list = []

    if obj_type == ObjectType.Folders:
        typer.echo(f"🔍 Environment: {env.upper()} | Recursively expanding {len(cuids)} folders...")
        descendants = get_all_descendants(base_url, cuids)
        final_cuid_list = list(set(cuids + descendants))
    else:
        final_cuid_list = cuids

    # Construct and print the final query
    formatted_cuids = ",".join([f"'{c}'" for c in final_cuid_list])
    final_query = f"SELECT * FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS WHERE SI_CUID IN ({formatted_cuids})"

    typer.secho("\n--- Generated CMS Query ---", fg=typer.colors.BRIGHT_RED)
    typer.echo(final_query)
    
    try:
        results = execute_cms_query(base_url, final_query)
        typer.secho(f"\n--- Results ({len(results)} objects found) ---", fg=typer.colors.GREEN)
        typer.echo(json.dumps(results, indent=2))
    except Exception as e:
        typer.error(f"Failed to execute final query: {e}")

if __name__ == "__main__":
    app()
