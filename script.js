import typer
import requests
import json
from typing import List
from enum import Enum

app = typer.Typer(help="SAP BusinessObjects Metadata Explorer")

class ObjectType(str, Enum):
    Reports = "Reports"
    Connections = "Connections"
    Universes = "Universes"
    Folders = "Folders"

def get_session_token(host: str, token_input: str):
    # This script assumes you are passing the X-SAP-LogonToken directly 
    # as an argument or it's stored in the environment.
    return token_input

def execute_cms_query(host, token, query):
    url = f"{host}:6405/biprws/v1/cmsquery"
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SAP-LogonToken': token
    }
    response = requests.post(url, headers=headers, json={"query": query})
    response.raise_for_status()
    return response.json().get('entries', [])

def get_all_descendants(host, token, parent_cuids: List[str]):
    """Recursively finds all children and grandchildren CUIDs."""
    all_found_cuids = set()
    to_process = list(parent_cuids)
    
    while to_process:
        # Format the CUID list for the query
        formatted_list = ",".join([f"'{c}'" for c in to_process])
        query = f"SELECT SI_CUID, SI_KIND FROM CI_INFOOBJECTS WHERE SI_PARENT_CUID IN ({formatted_list})"
        
        children = execute_cms_query(host, token, query)
        
        # Clear processing list for next depth level
        to_process = []
        
        for child in children:
            cuid = child.get('SI_CUID')
            kind = child.get('SI_KIND')
            
            if cuid not in all_found_cuids:
                all_found_cuids.add(cuid)
                # If it's a folder, we need to drill deeper in the next iteration
                if kind == 'Folder':
                    to_process.append(cuid)
                    
    return list(all_found_cuids)

@app.command()
def fetch(
    env: str = typer.Option(..., help="The base host URL (e.g., http://bo-server)"),
    token: str = typer.Option(..., help="Valid X-SAP-LogonToken"),
    obj_type: ObjectType = typer.Option(..., "--type", help="Type of objects to query"),
    cuids: List[str] = typer.Argument(..., help="List of CUIDs to process")
):
    """
    Fetch SAP BO metadata based on CUIDs. Performs recursive lookup for Folders.
    """
    final_cuid_list = []

    if obj_type == ObjectType.Folders:
        typer.echo(f"🔍 Performing recursive search for {len(cuids)} folders...")
        # Include the original folder CUIDs plus all discovered descendants
        descendants = get_all_descendants(env, token, cuids)
        final_cuid_list = list(set(cuids + descendants))
    else:
        # For Reports, Connections, Universes - use the direct list
        final_cuid_list = cuids

    # Construct the final query
    formatted_cuids = ",".join([f"'{c}'" for c in final_cuid_list])
    final_query = f"SELECT * FROM CI_INFOOBJECTS, CI_APPOBJECTS, CI_SYSTEMOBJECTS WHERE SI_CUID IN ({formatted_cuids})"

    typer.secho("\n--- Generated CMS Query ---", fg=typer.colors.BRIGHT_RED)
    typer.echo(final_query)
    
    # Optional: Execute and print results
    try:
        results = execute_cms_query(env, token, final_query)
        typer.secho(f"\n--- Results ({len(results)} objects found) ---", fg=typer.colors.GREEN)
        typer.echo(json.dumps(results, indent=2))
    except Exception as e:
        typer.error(f"Failed to execute final query: {e}")

if __name__ == "__main__":
    app()
