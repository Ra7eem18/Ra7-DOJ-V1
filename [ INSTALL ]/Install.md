

Job
    ['justic'] = {
        label = 'Justice',
        defaultDuty = true,
        offDutyPay = false,
        grades = {
            ['0'] = {
                name = 'lawyer',
                payment = 200
            },
            ['1'] = {
                name = 'lawyer |',
                payment = 300
            },
            ['2'] = {
                name = 'prosecutor',
                payment = 250
            },
            ['3'] = {
                name = 'prosecutor |',
                payment = 350
            },
            ['4'] = {
                name = 'Deputy Head Of Judge',
                isboss = true,
                payment = 700
            },
            ['5'] = {
                name = 'Head Of Judge',
                isboss = true,
                payment = 1000
            },
        },
    },

Item
	['doj_tablet'] = {
    ['name'] = 'doj_tablet',
    ['label'] = 'Justice Tablet',
    ['weight'] = 500,
    ['type'] = 'item',
    ['image'] = 'doj_tablet.png',
    ['unique'] = true,
    ['useable'] = true,
    ['shouldClose'] = true,
    ['description'] = 'تابلت وزارة العدل',
 },