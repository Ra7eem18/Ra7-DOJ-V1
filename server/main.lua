local QBCore = exports['qb-core']:GetCoreObject()


QBCore.Functions.CreateUseableItem(Config.TabletItem, function(...)
    local args = { ... }
    local Player, source = nil, nil

    for _, v in ipairs(args) do
        if type(v) == 'number' and v > 0 then
            local candidate = QBCore.Functions.GetPlayer(v)
            if candidate then
                Player, source = candidate, v
                break
            end
        end
    end

    if not source or not Player then
        if Config.Debug then
            print('[doj] ^1WARNING^7: could not resolve a valid source (server id) from UseItem callback arguments on this qb-inventory fork.')
        end
        return
    end

    TriggerClientEvent('doj:client:openTablet', source)
end)

CreateThread(function()
    Wait(60000) 

    while true do
        if Config.Maintenance.AuditLogRetentionDays and Config.Maintenance.AuditLogRetentionDays > 0 then
            MySQL.query('DELETE FROM doj_audit_log WHERE created_at < (NOW() - INTERVAL ? DAY)', { Config.Maintenance.AuditLogRetentionDays })
        end
        if Config.Maintenance.NotificationRetentionDays and Config.Maintenance.NotificationRetentionDays > 0 then
            MySQL.query('DELETE FROM doj_notifications WHERE is_read = 1 AND created_at < (NOW() - INTERVAL ? DAY)', { Config.Maintenance.NotificationRetentionDays })
        end

        Wait(24 * 60 * 60 * 1000) -- كل 24 ساعة
    end
end)


local function GetContext(src)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return nil end

    local job = Player.PlayerData.job
    local gradeLevel = (job and job.grade and job.grade.level) or 0
    local role = Shared.ResolveStaffRole(job and job.name or '', gradeLevel)

    return {
        source = src,
        citizenid = Player.PlayerData.citizenid,
        name = ('%s %s'):format(Player.PlayerData.charinfo.firstname, Player.PlayerData.charinfo.lastname),
        job = job,
        role = role, -- lawyer | prosecutor | judge | nil (مواطن عادي)
    }
end

local function PermLevel(ctx, permKey)
    if not ctx or not ctx.role then return false end
    return Shared.HasPermission(ctx.role, permKey)
end

local function HasPerm(ctx, permKey)
    local level = PermLevel(ctx, permKey)
    return level ~= false and level ~= nil
end


local function CanAccessCase(ctx, caseRow, permKey)
    local level = PermLevel(ctx, permKey)

    if level == 'all' then return true end

    if level == 'assigned' then
        return caseRow.lawyer_citizenid == ctx.citizenid
            or caseRow.prosecutor_citizenid == ctx.citizenid
            or caseRow.judge_citizenid == ctx.citizenid
    end

    if level == 'open_or_assigned' then
        if ctx.role == 'lawyer' then
            return caseRow.lawyer_citizenid == ctx.citizenid
                or caseRow.lawyer_citizenid == nil or caseRow.lawyer_citizenid == ''
        elseif ctx.role == 'prosecutor' then
            return caseRow.prosecutor_citizenid == ctx.citizenid
                or caseRow.prosecutor_citizenid == nil or caseRow.prosecutor_citizenid == ''
        end
        return false
    end

    return false
end


local function GetCitizenPhoneNumber(citizenid, fallbackPhone)
    if GetResourceState('lb-phone') == 'started' then
        local ok, row = pcall(function()
            return MySQL.single.await('SELECT phone_number FROM phone_phones WHERE owner_id = ? ORDER BY last_seen DESC LIMIT 1', { citizenid })
        end)
        if ok and row and row.phone_number then
            return row.phone_number
        end
    end
    return fallbackPhone
end

local function SafeJsonDecode(str)
    if not str or str == '' then return {} end
    local ok, decoded = pcall(json.decode, str)
    if ok and decoded then return decoded end
    return {}
end

local function LogAudit(ctx, action, caseId, details)
    MySQL.insert('INSERT INTO doj_audit_log (actor_citizenid, actor_name, actor_role, action, case_id, details) VALUES (?,?,?,?,?,?)', {
        ctx.citizenid, ctx.name, ctx.role or 'citizen', action, caseId, details or ''
    })
end


local function GetSourceFromPlayer(Player)
    if not Player then return nil end

    if type(Player.PlayerId) == 'function' then
        local ok, id = pcall(Player.PlayerId)
        if ok and id then return id end
    end

    if Player.PlayerData and Player.PlayerData.source then
        return Player.PlayerData.source
    end

    return nil
end

local function PushNotification(citizenid, caseId, title, message)
    MySQL.insert.await('INSERT INTO doj_notifications (citizenid, case_id, title, message) VALUES (?,?,?,?)', {
        citizenid, caseId, title, message
    })
    local target = QBCore.Functions.GetPlayerByCitizenId(citizenid)
    if target then
        local targetSource = GetSourceFromPlayer(target)
        if targetSource then
            TriggerClientEvent('doj:client:newNotification', targetSource, { title = title, message = message })
        end
    end
end

local function NotifyOnlineJudges(title, message)
    local players = QBCore.Functions.GetQBPlayers()
    for _, Player in pairs(players) do
        local job = Player.PlayerData.job
        local gradeLevel = (job and job.grade and job.grade.level) or 0
        local role = Shared.ResolveStaffRole(job and job.name or '', gradeLevel)
        if role == 'judge' then
            local targetSource = GetSourceFromPlayer(Player)
            if targetSource then
                TriggerClientEvent('doj:client:newNotification', targetSource, { title = title, message = message })
            end
        end
    end
end

local function GetPlayerBasics(src)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return nil end
    return {
        citizenid = Player.PlayerData.citizenid,
        name = ('%s %s'):format(Player.PlayerData.charinfo.firstname, Player.PlayerData.charinfo.lastname),
    }
end

local function FetchCaseNotesAndEvidence(caseId)
    local notes = MySQL.query.await('SELECT * FROM doj_case_notes WHERE case_id = ? ORDER BY created_at ASC', { caseId }) or {}
    local evidence = MySQL.query.await(
        'SELECT id, uploader_citizenid, uploader_name, caption, image_url, position, created_at FROM doj_case_evidence WHERE case_id = ? ORDER BY position ASC, id ASC',
        { caseId }
    ) or {}
    return notes, evidence
end


lib.callback.register('doj:server:searchCitizen', function(source, query)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'search_citizen') then return { ok = false, error = 'no_permission' } end
    if not query or query == '' then return { ok = false, error = 'empty_query' } end

    local likeQuery = '%' .. query .. '%'
    local rows = MySQL.query.await([[
        SELECT citizenid, charinfo FROM players
        WHERE citizenid LIKE ? OR JSON_EXTRACT(charinfo, '$.firstname') LIKE ? OR JSON_EXTRACT(charinfo, '$.lastname') LIKE ?
        LIMIT 15
    ]], { likeQuery, likeQuery, likeQuery })

    local results = {}
    for _, row in ipairs(rows or {}) do
        local ok, info = pcall(json.decode, row.charinfo)
        if ok and info then
            results[#results + 1] = {
                citizenid = row.citizenid,
                name = ('%s %s'):format(info.firstname or '?', info.lastname or '?'),
                phone = GetCitizenPhoneNumber(row.citizenid, info.phone),
            }
        end
    end

    return { ok = true, data = results }
end)


lib.callback.register('doj:server:getCitizenRecord', function(source, citizenid)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'view_citizen_record') then return { ok = false, error = 'no_permission' } end
    if not citizenid then return { ok = false, error = 'missing_citizenid' } end

    local citizenRow = MySQL.single.await('SELECT citizenid, charinfo FROM players WHERE citizenid = ?', { citizenid })
    if not citizenRow then return { ok = false, error = 'citizen_not_found' } end

    local ok, info = pcall(json.decode, citizenRow.charinfo)
    local citizen = {
        citizenid = citizenRow.citizenid,
        name = (ok and info) and ('%s %s'):format(info.firstname or '?', info.lastname or '?') or '?',
        phone = GetCitizenPhoneNumber(citizenRow.citizenid, ok and info and info.phone or nil),
    }

    local cases = MySQL.query.await('SELECT * FROM doj_cases WHERE citizen_citizenid = ? ORDER BY created_at DESC', { citizenid }) or {}
    for _, c in ipairs(cases) do c.charges = SafeJsonDecode(c.charges) end

    local requests = MySQL.query.await('SELECT * FROM doj_case_requests WHERE citizenid = ? ORDER BY created_at DESC', { citizenid }) or {}

    return { ok = true, data = { citizen = citizen, cases = cases, requests = requests } }
end)


lib.callback.register('doj:server:getDashboardStats', function(source)
    local ctx = GetContext(source)
    if not PermLevel(ctx, 'view_case_list') then return { ok = false, error = 'no_permission' } end

    local totalRow = MySQL.single.await('SELECT COUNT(*) as cnt FROM doj_cases')
    local activeRow = MySQL.single.await("SELECT COUNT(*) as cnt FROM doj_cases WHERE status IN ('open','in_review')")
    local judgedRow = MySQL.single.await("SELECT COUNT(*) as cnt FROM doj_cases WHERE status = 'judged'")

    return {
        ok = true,
        data = {
            total = (totalRow and totalRow.cnt) or 0,
            active = (activeRow and activeRow.cnt) or 0,
            judged = (judgedRow and judgedRow.cnt) or 0,
        },
    }
end)


lib.callback.register('doj:server:getCases', function(source, filters)
    local ctx = GetContext(source)
    local level = PermLevel(ctx, 'view_case_list')
    if not level then return { ok = false, error = 'no_permission' } end
    filters = filters or {}

    local where, params = {}, {}

    if filters.status and filters.status ~= 'all' then
        where[#where + 1] = 'status = ?'
        params[#params + 1] = filters.status
    end
    if filters.type and filters.type ~= 'all' then
        where[#where + 1] = 'type = ?'
        params[#params + 1] = filters.type
    end
    if filters.search and filters.search ~= '' then
        where[#where + 1] = '(case_number LIKE ? OR title LIKE ? OR citizen_name LIKE ?)'
        local like = '%' .. filters.search .. '%'
        params[#params + 1] = like
        params[#params + 1] = like
        params[#params + 1] = like
    end

    local limitVal = tonumber(filters.limit) or 150
    if limitVal > 150 then limitVal = 150 end
    if limitVal < 1 then limitVal = 1 end

    local sql = 'SELECT * FROM doj_cases'
    if #where > 0 then sql = sql .. ' WHERE ' .. table.concat(where, ' AND ') end
    sql = sql .. (' ORDER BY created_at DESC LIMIT %d'):format(limitVal)

    local rows = MySQL.query.await(sql, params) or {}
    for _, c in ipairs(rows) do c.charges = SafeJsonDecode(c.charges) end

    return { ok = true, data = rows }
end)


lib.callback.register('doj:server:getCaseById', function(source, caseId)
    local ctx = GetContext(source)
    if not ctx or not ctx.role then return { ok = false, error = 'no_permission' } end
    if not caseId then return { ok = false, error = 'missing_id' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { caseId })
    if not row then return { ok = false, error = 'not_found' } end

    if not CanAccessCase(ctx, row, 'view_case_detail') then return { ok = false, error = 'no_permission' } end

    row.charges = SafeJsonDecode(row.charges)
    local notes, evidence = FetchCaseNotesAndEvidence(caseId)
    row.notes = notes
    row.evidence = evidence
    row.my_role = ctx.role

    local myClaim = MySQL.single.await(
        'SELECT id FROM doj_case_claims WHERE case_id = ? AND requester_citizenid = ? AND status = "pending"',
        { caseId, ctx.citizenid }
    )
    row.my_pending_claim = myClaim ~= nil

    return { ok = true, data = row }
end)


lib.callback.register('doj:server:createCase', function(source, payload)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'create_case') then return { ok = false, error = 'no_permission' } end
    if not payload or not payload.citizen_citizenid or not payload.title or not payload.type then
        return { ok = false, error = 'invalid_payload' }
    end

    local citizenRow = MySQL.single.await('SELECT charinfo FROM players WHERE citizenid = ?', { payload.citizen_citizenid })
    if not citizenRow then return { ok = false, error = 'citizen_not_found' } end

    local ok, info = pcall(json.decode, citizenRow.charinfo)
    local citizenName = (ok and info) and ('%s %s'):format(info.firstname, info.lastname) or 'Citizen'

    local caseNumber = Shared.GenerateCaseNumber()

    local prosecutorId, prosecutorName = nil, nil
    if ctx.role == 'prosecutor' then
        prosecutorId, prosecutorName = ctx.citizenid, ctx.name
    end

    local insertId = MySQL.insert.await([[
        INSERT INTO doj_cases
            (case_number, type, title, description, citizen_citizenid, citizen_name, prosecutor_citizenid, prosecutor_name, status, charges)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    ]], {
        caseNumber, payload.type, payload.title, payload.description or '',
        payload.citizen_citizenid, citizenName,
        prosecutorId, prosecutorName,
        'open', json.encode(payload.charges or {}),
    })

    if insertId then
        PushNotification(payload.citizen_citizenid, insertId,
            'New Case Filed Against You',
            ('Case #%s "%s" has been filed by %s.'):format(caseNumber, payload.title, ctx.name))
        LogAudit(ctx, 'create_case', insertId, ('Created case %s'):format(caseNumber))

        if payload.linked_request_id then
            MySQL.update.await('UPDATE doj_case_requests SET linked_case_id = ? WHERE id = ?', { insertId, payload.linked_request_id })
        end
    end

    return { ok = insertId ~= nil, data = { id = insertId, case_number = caseNumber } }
end)


lib.callback.register('doj:server:updateCase', function(source, payload)
    local ctx = GetContext(source)
    if not payload or not payload.id then return { ok = false, error = 'invalid_payload' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { payload.id })
    if not row then return { ok = false, error = 'not_found' } end
    if not CanAccessCase(ctx, row, 'edit_case') then return { ok = false, error = 'no_permission' } end

    local title = payload.title or row.title
    local description = payload.description ~= nil and payload.description or row.description
    local status = payload.status or row.status
    local charges = payload.charges ~= nil and json.encode(payload.charges) or row.charges

    MySQL.update.await('UPDATE doj_cases SET title = ?, description = ?, status = ?, charges = ? WHERE id = ?',
        { title, description, status, charges, payload.id })

    if status ~= row.status then
        PushNotification(row.citizen_citizenid, row.id, 'Case Status Updated',
            ('Your case #%s status changed to "%s".'):format(row.case_number, status))
    end

    LogAudit(ctx, 'update_case', row.id, ('Updated case %s'):format(row.case_number))

    return { ok = true }
end)


lib.callback.register('doj:server:submitClaim', function(source, caseId)
    local ctx = GetContext(source)
    local claimRole = PermLevel(ctx, 'claim_case') -- 'lawyer' | 'prosecutor' | false
    if claimRole ~= 'lawyer' and claimRole ~= 'prosecutor' then
        return { ok = false, error = 'no_permission' }
    end
    if not caseId then return { ok = false, error = 'missing_id' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { caseId })
    if not row then return { ok = false, error = 'not_found' } end

    if claimRole == 'lawyer' and row.lawyer_citizenid then return { ok = false, error = 'already_assigned' } end
    if claimRole == 'prosecutor' and row.prosecutor_citizenid then return { ok = false, error = 'already_assigned' } end

    local existing = MySQL.single.await(
        'SELECT id FROM doj_case_claims WHERE case_id = ? AND requester_citizenid = ? AND role = ? AND status = "pending"',
        { caseId, ctx.citizenid, claimRole }
    )
    if existing then return { ok = false, error = 'claim_pending' } end

    MySQL.insert.await('INSERT INTO doj_case_claims (case_id, role, requester_citizenid, requester_name) VALUES (?,?,?,?)', {
        caseId, claimRole, ctx.citizenid, ctx.name
    })

    NotifyOnlineJudges('New Case Claim Request',
        ('%s requested to handle case #%s as %s'):format(ctx.name, row.case_number, claimRole))
    LogAudit(ctx, 'submit_claim', caseId, ('Requested to handle as %s'):format(claimRole))

    return { ok = true }
end)


lib.callback.register('doj:server:getPendingClaims', function(source, filters)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'manage_claims') then return { ok = false, error = 'no_permission' } end
    filters = filters or {}
    local statusFilter = (filters.status and filters.status ~= 'all') and filters.status or 'pending'

    local rows = MySQL.query.await([[
        SELECT cl.*, c.case_number, c.title, c.citizen_name
        FROM doj_case_claims cl
        JOIN doj_cases c ON c.id = cl.case_id
        WHERE cl.status = ?
        ORDER BY cl.created_at DESC LIMIT 100
    ]], { statusFilter })

    return { ok = true, data = rows or {} }
end)


lib.callback.register('doj:server:handleClaim', function(source, payload)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'manage_claims') then return { ok = false, error = 'no_permission' } end
    if not payload or not payload.id or not payload.decision then return { ok = false, error = 'invalid_payload' } end
    if payload.decision ~= 'approved' and payload.decision ~= 'rejected' then return { ok = false, error = 'invalid_payload' } end

    local claim = MySQL.single.await('SELECT * FROM doj_case_claims WHERE id = ?', { payload.id })
    if not claim then return { ok = false, error = 'not_found' } end
    if claim.status ~= 'pending' then return { ok = false, error = 'already_handled' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { claim.case_id })
    if not row then return { ok = false, error = 'not_found' } end

    if payload.decision == 'approved' then
        if claim.role == 'lawyer' and row.lawyer_citizenid then
            MySQL.update.await('UPDATE doj_case_claims SET status = "rejected", handled_by_name = ? WHERE id = ?', { ctx.name, payload.id })
            return { ok = false, error = 'already_assigned' }
        end
        if claim.role == 'prosecutor' and row.prosecutor_citizenid then
            MySQL.update.await('UPDATE doj_case_claims SET status = "rejected", handled_by_name = ? WHERE id = ?', { ctx.name, payload.id })
            return { ok = false, error = 'already_assigned' }
        end

        if claim.role == 'lawyer' then
            MySQL.update.await('UPDATE doj_cases SET lawyer_citizenid = ?, lawyer_name = ? WHERE id = ?', { claim.requester_citizenid, claim.requester_name, claim.case_id })
        else
            MySQL.update.await('UPDATE doj_cases SET prosecutor_citizenid = ?, prosecutor_name = ? WHERE id = ?', { claim.requester_citizenid, claim.requester_name, claim.case_id })
        end

        MySQL.update.await('UPDATE doj_case_claims SET status = "approved", handled_by_name = ? WHERE id = ?', { ctx.name, payload.id })
        PushNotification(claim.requester_citizenid, claim.case_id, 'Claim Approved',
            ('You are now the %s for case #%s.'):format(claim.role, row.case_number))
    else
        MySQL.update.await('UPDATE doj_case_claims SET status = "rejected", handled_by_name = ? WHERE id = ?', { ctx.name, payload.id })
        PushNotification(claim.requester_citizenid, claim.case_id, 'Claim Rejected',
            ('Your request to handle case #%s was rejected.'):format(row.case_number))
    end

    LogAudit(ctx, 'handle_claim', claim.case_id, ('%s claim #%d (%s)'):format(payload.decision, payload.id, claim.role))

    return { ok = true }
end)


lib.callback.register('doj:server:addNote', function(source, payload)
    local ctx = GetContext(source)
    if not payload or not payload.id or not payload.text or payload.text == '' then return { ok = false, error = 'invalid_payload' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { payload.id })
    if not row then return { ok = false, error = 'not_found' } end
    if not CanAccessCase(ctx, row, 'add_note') then return { ok = false, error = 'no_permission' } end

    MySQL.insert.await('INSERT INTO doj_case_notes (case_id, author_citizenid, author_name, author_role, text) VALUES (?,?,?,?,?)', {
        payload.id, ctx.citizenid, ctx.name, ctx.role, payload.text
    })

    LogAudit(ctx, 'add_note', payload.id, 'Added a note')

    local notes = MySQL.query.await('SELECT * FROM doj_case_notes WHERE case_id = ? ORDER BY created_at ASC', { payload.id })
    return { ok = true, data = notes }
end)


lib.callback.register('doj:server:addEvidence', function(source, payload)
    local ctx = GetContext(source)
    if not payload or not payload.id or not payload.image_url or payload.image_url == '' then
        return { ok = false, error = 'invalid_payload' }
    end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { payload.id })
    if not row then return { ok = false, error = 'not_found' } end
    if not CanAccessCase(ctx, row, 'add_evidence') then return { ok = false, error = 'no_permission' } end

    local url = payload.image_url:match('^%s*(.-)%s*$')
    if not url:match('^https?://') then
        return { ok = false, error = 'invalid_url' }
    end
    if #url > 490 then
        return { ok = false, error = 'invalid_url' }
    end

    local countRow = MySQL.single.await('SELECT COUNT(*) as cnt FROM doj_case_evidence WHERE case_id = ?', { payload.id })
    if countRow and countRow.cnt >= Config.Evidence.MaxImagesPerCase then
        return { ok = false, error = 'max_images_reached' }
    end

    local maxPosRow = MySQL.single.await('SELECT MAX(position) as maxpos FROM doj_case_evidence WHERE case_id = ?', { payload.id })
    local nextPos = (maxPosRow and maxPosRow.maxpos and maxPosRow.maxpos + 1) or 0

    MySQL.insert.await([[
        INSERT INTO doj_case_evidence (case_id, uploader_citizenid, uploader_name, caption, image_url, position)
        VALUES (?,?,?,?,?,?)
    ]], { payload.id, ctx.citizenid, ctx.name, payload.caption or '', url, nextPos })

    LogAudit(ctx, 'add_evidence', payload.id, 'Added evidence image')

    local evidence = MySQL.query.await(
        'SELECT id, uploader_citizenid, uploader_name, caption, image_url, position, created_at FROM doj_case_evidence WHERE case_id = ? ORDER BY position ASC, id ASC',
        { payload.id }
    )
    return { ok = true, data = evidence }
end)


lib.callback.register('doj:server:reorderEvidence', function(source, payload)
    local ctx = GetContext(source)
    if not payload or not payload.case_id or not payload.order then return { ok = false, error = 'invalid_payload' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { payload.case_id })
    if not row then return { ok = false, error = 'not_found' } end
    if not CanAccessCase(ctx, row, 'add_evidence') then return { ok = false, error = 'no_permission' } end

    for index, evidenceId in ipairs(payload.order) do
        MySQL.update.await('UPDATE doj_case_evidence SET position = ? WHERE id = ? AND case_id = ?', { index, evidenceId, payload.case_id })
    end

    return { ok = true }
end)


lib.callback.register('doj:server:deleteEvidence', function(source, payload)
    local ctx = GetContext(source)
    if not payload or not payload.id or not payload.case_id then return { ok = false, error = 'invalid_payload' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { payload.case_id })
    if not row then return { ok = false, error = 'not_found' } end
    if not CanAccessCase(ctx, row, 'add_evidence') then return { ok = false, error = 'no_permission' } end

    MySQL.query.await('DELETE FROM doj_case_evidence WHERE id = ? AND case_id = ?', { payload.id, payload.case_id })
    LogAudit(ctx, 'delete_evidence', payload.case_id, 'Removed an evidence image')

    return { ok = true }
end)


lib.callback.register('doj:server:issueVerdict', function(source, payload)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'issue_verdict') then return { ok = false, error = 'no_permission' } end
    if not payload or not payload.id or not payload.verdict or payload.verdict == '' then return { ok = false, error = 'invalid_payload' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { payload.id })
    if not row then return { ok = false, error = 'not_found' } end

    MySQL.update.await([[
        UPDATE doj_cases SET status = 'judged', verdict = ?, verdict_date = NOW(), judge_citizenid = ?, judge_name = ? WHERE id = ?
    ]], { payload.verdict, ctx.citizenid, ctx.name, payload.id })

    PushNotification(row.citizen_citizenid, row.id, 'Verdict Issued',
        ('Judge %s has issued a verdict in case #%s.'):format(ctx.name, row.case_number))

    LogAudit(ctx, 'issue_verdict', row.id, ('Verdict issued for case %s'):format(row.case_number))

    return { ok = true }
end)



lib.callback.register('doj:server:getMyDashboardStats', function(source)
    local basics = GetPlayerBasics(source)
    if not basics then return { ok = false, error = 'no_player' } end

    local casesRow = MySQL.single.await('SELECT COUNT(*) as cnt FROM doj_cases WHERE citizen_citizenid = ?', { basics.citizenid })
    local unreadRow = MySQL.single.await('SELECT COUNT(*) as cnt FROM doj_notifications WHERE citizenid = ? AND is_read = 0', { basics.citizenid })

    return {
        ok = true,
        data = {
            total_cases = (casesRow and casesRow.cnt) or 0,
            unread_notifications = (unreadRow and unreadRow.cnt) or 0,
        },
    }
end)

lib.callback.register('doj:server:getMyCases', function(source, filters)
    local basics = GetPlayerBasics(source)
    if not basics then return { ok = false, error = 'no_player' } end

    filters = filters or {}
    local limitVal = tonumber(filters.limit) or 100
    if limitVal > 100 then limitVal = 100 end
    if limitVal < 1 then limitVal = 1 end

    local rows = MySQL.query.await(
        ('SELECT * FROM doj_cases WHERE citizen_citizenid = ? ORDER BY created_at DESC LIMIT %d'):format(limitVal),
        { basics.citizenid }
    ) or {}
    for _, c in ipairs(rows) do c.charges = SafeJsonDecode(c.charges) end

    return { ok = true, data = rows }
end)

lib.callback.register('doj:server:submitCaseRequest', function(source, payload)
    local basics = GetPlayerBasics(source)
    if not basics then return { ok = false, error = 'no_player' } end
    if not payload or not payload.subject or not payload.description then return { ok = false, error = 'invalid_payload' } end

    local insertId = MySQL.insert.await([[
        INSERT INTO doj_case_requests (citizenid, citizen_name, subject, description, target_citizenid, target_name)
        VALUES (?,?,?,?,?,?)
    ]], { basics.citizenid, basics.name, payload.subject, payload.description, payload.target_citizenid, payload.target_name })

    return { ok = insertId ~= nil, data = { id = insertId } }
end)

lib.callback.register('doj:server:getMyRequests', function(source)
    local basics = GetPlayerBasics(source)
    if not basics then return { ok = false, error = 'no_player' } end
    local rows = MySQL.query.await('SELECT * FROM doj_case_requests WHERE citizenid = ? ORDER BY created_at DESC', { basics.citizenid })
    return { ok = true, data = rows or {} }
end)

lib.callback.register('doj:server:getMyNotifications', function(source)
    local basics = GetPlayerBasics(source)
    if not basics then return { ok = false, error = 'no_player' } end
    local rows = MySQL.query.await('SELECT * FROM doj_notifications WHERE citizenid = ? ORDER BY created_at DESC LIMIT 50', { basics.citizenid })
    return { ok = true, data = rows or {} }
end)

lib.callback.register('doj:server:markNotificationRead', function(source, notifId)
    local basics = GetPlayerBasics(source)
    if not basics then return { ok = false, error = 'no_player' } end
    if not notifId then return { ok = false, error = 'missing_id' } end
    MySQL.update.await('UPDATE doj_notifications SET is_read = 1 WHERE id = ? AND citizenid = ?', { notifId, basics.citizenid })
    return { ok = true }
end)


lib.callback.register('doj:server:getAllRequests', function(source, filters)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'manage_requests') then return { ok = false, error = 'no_permission' } end
    filters = filters or {}

    local where, params = {}, {}
    if filters.status and filters.status ~= 'all' then
        where[#where + 1] = 'status = ?'
        params[#params + 1] = filters.status
    end

    local sql = 'SELECT * FROM doj_case_requests'
    if #where > 0 then sql = sql .. ' WHERE ' .. table.concat(where, ' AND ') end
    sql = sql .. ' ORDER BY created_at DESC LIMIT 100'

    local rows = MySQL.query.await(sql, params)
    return { ok = true, data = rows or {} }
end)

lib.callback.register('doj:server:updateRequest', function(source, payload)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'manage_requests') then return { ok = false, error = 'no_permission' } end
    if not payload or not payload.id or not payload.status then return { ok = false, error = 'invalid_payload' } end

    local row = MySQL.single.await('SELECT * FROM doj_case_requests WHERE id = ?', { payload.id })
    if not row then return { ok = false, error = 'not_found' } end

    MySQL.update.await('UPDATE doj_case_requests SET status = ?, hearing_date = ?, handled_by_name = ? WHERE id = ?',
        { payload.status, payload.hearing_date, ctx.name, payload.id })

    local msg
    if payload.status == 'approved' then
        msg = 'Your request "' .. row.subject .. '" has been approved.'
    elseif payload.status == 'rejected' then
        msg = 'Your request "' .. row.subject .. '" has been rejected.'
    elseif payload.status == 'scheduled' and payload.hearing_date then
        msg = ('A hearing for "%s" has been scheduled on %s.'):format(row.subject, payload.hearing_date)
    else
        msg = 'Your request status has been updated: ' .. row.subject
    end

    PushNotification(row.citizenid, nil, 'Request Update', msg)
    LogAudit(ctx, 'update_request', nil, ('Updated request #%d (%s)'):format(row.id, payload.status))

    return { ok = true }
end)


lib.callback.register('doj:server:getAuditLog', function(source, filters)
    local ctx = GetContext(source)
    if not HasPerm(ctx, 'view_audit_log') then return { ok = false, error = 'no_permission' } end
    filters = filters or {}

    local where, params = {}, {}
    if filters.search and filters.search ~= '' then
        where[#where + 1] = '(actor_name LIKE ? OR action LIKE ? OR details LIKE ?)'
        local like = '%' .. filters.search .. '%'
        params[#params + 1] = like
        params[#params + 1] = like
        params[#params + 1] = like
    end

    local sql = 'SELECT * FROM doj_audit_log'
    if #where > 0 then sql = sql .. ' WHERE ' .. table.concat(where, ' AND ') end
    sql = sql .. ' ORDER BY created_at DESC LIMIT 200'

    local rows = MySQL.query.await(sql, params)
    return { ok = true, data = rows or {} }
end)


lib.callback.register('doj:server:getCaseForExport', function(source, caseId)
    local ctx = GetContext(source)
    if not ctx then return { ok = false, error = 'no_permission' } end
    if not caseId then return { ok = false, error = 'missing_id' } end

    local row = MySQL.single.await('SELECT * FROM doj_cases WHERE id = ?', { caseId })
    if not row then return { ok = false, error = 'not_found' } end

    local isOwner = ctx.citizenid == row.citizen_citizenid
    if not isOwner and not CanAccessCase(ctx, row, 'export_pdf') then
        return { ok = false, error = 'no_permission' }
    end

    row.charges = SafeJsonDecode(row.charges)
    local notes, evidence = FetchCaseNotesAndEvidence(caseId)
    row.notes = notes
    row.evidence = evidence

    LogAudit(ctx, 'export_pdf', caseId, ('Exported case %s'):format(row.case_number))

    return { ok = true, data = row }
end)



-- الرجاء من الجميع عدم حذفه للحفاظ على حقوق الملكيه
-- لن نسامح من يقوم ب ازالتها بدون اذن مسبق من Ra7-Dev

CreateThread(function()
    print("^5")
    print("^5╔══════════════════════════════════════════════════╗^0")
    print("^5║                  ^3Ra7-Dev^5                         ║^0")
    print("^5║                                                  ║^0")
    print("^5║              ^7Developer: Ra7eem^5                   ║^0")
    print("^5║              ^7© 2026 Ra7-Dev^5                      ║^0")
    print("^5║                                                  ║^0")
    print("^5║              ^7All Rights Reserved^5                 ║^0")
    print("^5║                                                  ║^0")
    print("^5║          ^3https://discord.gg/WCnn2KBZJB^5           ║^0")
    print("^5║                                                  ║^0")
    print("^5║ ^1Unauthorized copying, modification or resale  ^5   ║^0")
    print("^5║ ^1of this script is strictly prohibited.^5           ║^0")
    print("^5╚══════════════════════════════════════════════════╝^0")
    print("^0")
end)