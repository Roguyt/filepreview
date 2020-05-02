const filepreview = require('./filepreview');

filepreview
    .generate(
        '/c/Datas/Dev Projects/transverse-51/api/uploads/f846483d-f783-4f0e-957d-70af520b06cf.pdf',
        '/c/Datas/Dev Projects/transverse-51/api/uploads/thumbnails/f846483d-f783-4f0e-957d-70af520b06cf.jpg',
        {
            quality: 70,
            pdf: true,
        }
    )
    .then(() => {
        console.log('Done');
    })
    .catch((e) => console.error(e));
