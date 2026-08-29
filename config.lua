Config = {}


Config.Debug = false
Config.DefaultLocale = 'en' -- 'en' or 'ar' -- default UI language
Config.SystemName = 'Ministry of Justice'
Config.ServerName = 'Ra7 Dev'
Config.TabletItem = 'doj_tablet'
Config.Target = {
    System = GetResourceState('ox_target') == 'started' and 'ox_target'
        or (GetResourceState('qb-target') == 'started' and 'qb-target' or nil),
}


Config.Kiosks = {
    {
        coords = vector4(-542.65, -204.02, 38.22, 205.0), -- عدّل الإحداثيات حسب موقعك
        model = `prop_atm_01`, -- موديل صحيح ومتحقق منه (ATM/كشك). غيّره لأي موديل تتأكد أولًا إنه صالح
        label = 'Ministry of Justice Kiosk',
        icon = 'fa-solid fa-tablet-screen-button',
        distance = 2.0,
    },
}


-- ترتيب الرتب داخل وظيفة justic: كل مفتاح رقم = grade.level -> الدور المرتبط فيه
-- عدّل الأرقام حسب ترتيب رتبك الفعلي بوظيفة justic بقاعدة بياناتك
Config.JudgeJobName = 'justic'
Config.JudgeGradeRoles = {
    [0] = 'lawyer',      -- lawyer
    [1] = 'lawyer',      -- lawyer | (نفس الدور بالنظام، فرق راتب باللعبة بس)
    [2] = 'prosecutor',  -- prosecutor
    [3] = 'prosecutor',  -- prosecutor | (نفس الدور بالنظام، فرق راتب باللعبة بس)
    [4] = 'judge',       -- Deputy Head Of Judge
    [5] = 'judge',       -- Head Of Judge
}

-- الشرطة كمدعي عام (اختياري، فعّله/عطّله من هنا)
Config.PoliceProsecutor = {
    enabled = true,
    job = 'police',
    minGrade = 4, -- أي ضابط برتبة 4 فأعلى بوظيفة الشرطة يعتبر مدعي عام تلقائيًا
}

-------------------------------------------------
-- مصفوفة الصلاحيات لكل دور
-------------------------------------------------
Config.Permissions = {
    lawyer = {
        view_case_list      = 'all',      -- يشوف كل القضايا عشان يقدر يطلب استلام أي وحدة بلا محامي
        view_case_detail     = 'open_or_assigned', -- القضايا المفتوحة (بلا محامي) + قضاياه هو
        create_case          = false,
        edit_case            = false,
        add_note             = 'assigned',
        add_evidence         = 'assigned',
        issue_verdict        = false,
        manage_requests      = false,
        manage_claims        = false,
        search_citizen       = true,
        view_citizen_record  = true,
        claim_case           = 'lawyer',  -- يقدر يرسل طلب استلام كمحامي دفاع
        view_audit_log       = false,
        export_pdf           = 'assigned',
    },
    prosecutor = {
        view_case_list      = 'all',
        view_case_detail     = 'open_or_assigned', -- القضايا المفتوحة (بلا مدعي عام) + قضاياه هو
        create_case          = true,
        edit_case            = 'assigned',
        add_note             = 'assigned',
        add_evidence         = 'assigned',
        issue_verdict        = false,
        manage_requests      = true,
        manage_claims        = false,
        search_citizen       = true,
        view_citizen_record  = true,
        claim_case           = 'prosecutor', -- يقدر يرسل طلب استلام كمدعي عام
        view_audit_log       = false,
        export_pdf           = 'assigned',
    },
    judge = {
        view_case_list      = 'all',
        view_case_detail     = 'all',
        create_case          = true,
        edit_case            = true,
        add_note             = 'all',
        add_evidence         = 'all',
        issue_verdict        = true,
        manage_requests      = true,
        manage_claims        = true, -- القاضي هو من يوافق/يرفض طلبات استلام القضايا
        search_citizen       = true,
        view_citizen_record  = true,
        claim_case           = false,
        view_audit_log       = true,
        export_pdf           = 'all',
    },
}


Config.Evidence = {
    MaxImagesPerCase = 30,
}

-------------------------------------------------
-- الصيانة الدورية - تنظيف تلقائي يمنع تضخم قاعدة البيانات مع الوقت (أداء أفضل على المدى الطويل)
-------------------------------------------------
Config.Maintenance = {
    AuditLogRetentionDays = 90,     -- يحذف سجلات التدقيق الأقدم من كذا يوم (0 = تعطيل)
    NotificationRetentionDays = 30, -- يحذف الإشعارات "المقروءة" الأقدم من كذا يوم فقط (0 = تعطيل)
}

Config.CaseTypes = { 'criminal', 'civil' }
Config.CaseStatuses = { 'open', 'in_review', 'judged', 'closed' }
Config.RequestStatuses = { 'pending', 'approved', 'rejected', 'scheduled' }
