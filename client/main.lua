local QBCore = exports['qb-core']:GetCoreObject()

local isTabletOpen = false
local spawnedKiosks = {}


local function GetMyRole()
    local PlayerData = QBCore.Functions.GetPlayerData()
    if not PlayerData or not PlayerData.job then return nil end
    local gradeLevel = (PlayerData.job.grade and PlayerData.job.grade.level) or 0
    return Shared.ResolveStaffRole(PlayerData.job.name, gradeLevel)
end


local function OpenTablet(forceCitizen)
    if isTabletOpen then return end
    isTabletOpen = true

    local role = forceCitizen and 'citizen' or (GetMyRole() or 'citizen')
    local PlayerData = QBCore.Functions.GetPlayerData()

    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'open',
        role = role,
        system = Config.SystemName,
        server = Config.ServerName,
        defaultLocale = Config.DefaultLocale,
        player = {
            name = ('%s %s'):format(PlayerData.charinfo.firstname, PlayerData.charinfo.lastname),
            citizenid = PlayerData.citizenid,
        },
        caseTypes = Config.CaseTypes,
        caseStatuses = Config.CaseStatuses,
        requestStatuses = Config.RequestStatuses,
        evidenceConfig = Config.Evidence,
    })
end

local function CloseTablet()
    if not isTabletOpen then return end
    isTabletOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

RegisterNUICallback('doj:close', function(_, cb)
    CloseTablet()
    cb('ok')
end)

RegisterNetEvent('doj:client:openTablet', function()
    OpenTablet(false)
end)

RegisterNetEvent('doj:client:newNotification', function(data)
    if Config.Debug then print('[doj] notification', json.encode(data)) end
    lib.notify({ title = data.title, description = data.message, type = 'inform', position = 'top' })
end)


RegisterNUICallback('doj:request', function(payload, cb)
    if not payload or not payload.event then
        cb({ ok = false, error = 'invalid_request' })
        return
    end
    lib.callback(payload.event, false, function(result)
        cb(result)
    end, payload.data)
end)


exports('useTablet', function(data, slot)
    TriggerEvent('doj:client:openTablet')
end)


local function SpawnKiosk(kiosk, idx)
    local model = kiosk.model

    if not IsModelInCdimage(model) or not IsModelValid(model) then
        print(('[doj] ^1ERROR^7: Invalid kiosk model for Config.Kiosks[%d] (hash: %s). Skipping this kiosk - fix the model in config.lua.'):format(idx, tostring(model)))
        return
    end

    lib.requestModel(model, 5000)

    local obj = CreateObject(model, kiosk.coords.x, kiosk.coords.y, kiosk.coords.z - 1.0, false, false, false)
    PlaceObjectOnGroundProperly(obj)
    SetEntityHeading(obj, kiosk.coords.w)
    FreezeEntityPosition(obj, true)
    SetEntityAsMissionEntity(obj, true, true)
    SetModelAsNoLongerNeeded(model)

    spawnedKiosks[idx] = obj

    if Config.Target.System == 'ox_target' then
        exports.ox_target:addLocalEntity(obj, {
            {
                name = 'doj_kiosk_' .. idx,
                icon = kiosk.icon,
                label = kiosk.label,
                distance = kiosk.distance,
                onSelect = function() OpenTablet(true) end,
            },
        })
    elseif Config.Target.System == 'qb-target' then
        exports['qb-target']:AddTargetEntity(obj, {
            options = {
                { type = 'client', icon = kiosk.icon, label = kiosk.label, action = function() OpenTablet(true) end },
            },
            distance = kiosk.distance,
        })
    else
        CreateThread(function()
            while DoesEntityExist(obj) do
                local sleep = 1000
                local ped = PlayerPedId()
                local dist = #(GetEntityCoords(ped) - GetEntityCoords(obj))
                if dist < 3.0 then
                    sleep = 0
                    lib.showTextUI(('[E] %s'):format(kiosk.label))
                    if IsControlJustReleased(0, 38) then OpenTablet(true) end
                else
                    lib.hideTextUI()
                end
                Wait(sleep)
            end
        end)
    end
end

CreateThread(function()
    for idx, kiosk in ipairs(Config.Kiosks) do
        SpawnKiosk(kiosk, idx)
    end
end)

AddEventHandler('onResourceStop', function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    for _, obj in pairs(spawnedKiosks) do
        if DoesEntityExist(obj) then DeleteEntity(obj) end
    end
end)


CreateThread(function()
    while true do
        local sleep = 500
        if isTabletOpen then
            sleep = 0
            if IsControlJustPressed(0, 322) then CloseTablet() end
        end
        Wait(sleep)
    end
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