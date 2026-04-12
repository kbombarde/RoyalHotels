async def build_data(token, cuids, base_url, page, page_size):

    async with httpx.AsyncClient() as client:

        objects, query = await cms_query(client, token, cuids, base_url)

        parent_ids = list(set(get_val(o, "SI_PARENTID") for o in objects))

        schedule_map = await get_all_schedules(client, token, parent_ids, base_url)

        result = []

        for idx, obj in enumerate(objects, start=1):

            parent_id = get_val(obj, "SI_PARENTID")
            schedules = schedule_map.get(parent_id, [])

            # ✅ only take first schedule (no duplicates)
            sched = schedules[0] if schedules else {}

            # ✅ extract error properly
            status_info = get_val(obj, "SI_STATUS_INFO")
            error_msg = ""

            if isinstance(status_info, dict):
                subst = status_info.get("SI_SUBST_STRINGS", {})
                if isinstance(subst, dict):
                    error_msg = subst.get("1", "")

            row = {
                "sr_no": idx,
                "instance_id": get_val(obj, "SI_ID"),
                "instance_name": get_val(obj, "SI_NAME"),
                "location": sched.get("path", ""),
                "owner": get_val(obj, "SI_OWNER"),
                "completion_time": get_val(obj, "SI_ENDTIME"),
                "next_run_time": get_val(obj, "SI_NEXTRUNTIME"),
                "submission_time": get_val(obj, "SI_CREATIONTIME"),
                "expiry": sched.get("expiry", ""),
                "server": get_val(obj, "SI_MACHINE_USED"),
                "error": error_msg
            }

            result.append(row)

        total = len(result)

        start = (page - 1) * page_size
        end = start + page_size

        return {
            "query": query,
            "total": total,
            "page": page,
            "data": result[start:end]
        }