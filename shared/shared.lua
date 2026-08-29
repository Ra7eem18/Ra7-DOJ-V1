Shared = {}

function Shared.GenerateCaseNumber()
    local year = os.date('%Y')
    local rand = math.random(10000, 99999)
    return ('DOJ-%s-%s'):format(year, rand)
end

-- يحدد دور الموظف (lawyer / prosecutor / judge / nil) بناءً على الوظيفة والرتبة
-- منطق fallback: لو الرتبة غير معرّفة صراحة بجدول Config.JudgeGradeRoles، ياخذ أقرب رتبة أقل معرّفة
function Shared.ResolveStaffRole(jobName, gradeLevel)
    if jobName == Config.JudgeJobName then
        if Config.JudgeGradeRoles[gradeLevel] then
            return Config.JudgeGradeRoles[gradeLevel]
        end
        -- fallback: أقرب رتبة أقل أو تساوي
        local bestGrade, bestRole = -1, nil
        for grade, role in pairs(Config.JudgeGradeRoles) do
            if grade <= gradeLevel and grade > bestGrade then
                bestGrade, bestRole = grade, role
            end
        end
        return bestRole
    end

    if Config.PoliceProsecutor.enabled and jobName == Config.PoliceProsecutor.job and gradeLevel >= Config.PoliceProsecutor.minGrade then
        return 'prosecutor'
    end

    return nil
end

function Shared.HasPermission(role, permKey)
    if not role then return false end
    local rolePerms = Config.Permissions[role]
    if not rolePerms then return false end
    return rolePerms[permKey]
end

return Shared
