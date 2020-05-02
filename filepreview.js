/*

  filepreview : A file preview generator for node.js

*/

const async = require('async');

const childProcess = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mimeDb = require('./db.json');

module.exports = {
    async generate(src, output, options) {
        // Normalize arguments
        let input = src;
        // eslint-disable-next-line no-param-reassign
        options = options || {};

        // Check for supported output format
        const extOutput = path.extname(output).toLowerCase().replace('.', '');
        const extInput = path.extname(input).toLowerCase().replace('.', '');

        if (extOutput !== 'gif' && extOutput !== 'jpg' && extOutput !== 'png') {
            throw new Error('Not a valid image output');
        }

        const fileArgs = [src];
        const fileExecOutput = childProcess.execFileSync('file', fileArgs);
        const isExecutable = fileExecOutput.toString().indexOf('executable');
        if (isExecutable > 0) {
            throw new Error('This file is an executable');
        }

        let fileType = 'other';

        Object.keys(mimeDb).some((key) => {
            if ('extensions' in mimeDb[key]) {
                return Object.keys(
                    mimeDb[key].extensions.some((keyExtension) => {
                        if (mimeDb[key].extensions[keyExtension] === extInput) {
                            if (key.split('/')[0] === 'image') {
                                fileType = 'image';
                            } else if (key.split('/')[0] === 'video') {
                                fileType = 'video';
                            } else {
                                fileType = 'other';
                            }

                            return true;
                        }

                        return false;
                    })
                );
            }

            return false;
        });

        if (extInput === 'pdf') {
            fileType = 'image';
        }

        if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0) {
            const url = input.split('/');
            const urlFilename = url[url.length - 1];
            let hash = crypto.createHash('sha512');
            hash.update(Math.random().toString());
            hash = hash.digest('hex');
            const tempInput = path.join(os.tmpdir(), hash + urlFilename);
            const curlArgs = ['--silent', '-L', input, '-o', tempInput];
            childProcess.execFileSync('curl', curlArgs);
            input = tempInput;
        }

        let stats;
        try {
            stats = await fs.promises.lstat(input);
        } catch (e) {
            throw new Error('Error while opening the file');
        }

        if (!stats.isFile()) {
            throw new Error("The input isn't a file");
        }

        if (fileType === 'video') {
            const ffmpegArgs = ['-y', '-i', input, '-vf', 'thumbnail', '-frames:v', '1', output];
            if (options.width > 0 && options.height > 0) {
                ffmpegArgs.splice(
                    4,
                    1,
                    `thumbnail,scale=${options.width}:${options.height}${
                        options.forceAspect ? ':force_original_aspect_ratio=decrease' : ''
                    }`
                );
            }

            childProcess.execFile('ffmpeg', ffmpegArgs, (childProcessErr) => {
                if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0) {
                    fs.unlinkSync(input);
                }

                if (childProcessErr) throw childProcessErr;
                return null;
            });
        }

        if (fileType === 'image') {
            const convertArgs = [`${input}[0]`, output];

            if (extInput === 'pdf') {
                convertArgs.splice(0, 0, `-density`, 300, '-colorspace', 'rgb');
            }
            if (options.width > 0 && options.height > 0) {
                convertArgs.splice(0, 0, '-resize', `${options.width}x${options.height}`);
            }
            if (options.autorotate) {
                convertArgs.splice(0, 0, '-auto-orient');
            }
            if (options.quality) {
                convertArgs.splice(0, 0, '-quality', options.quality);
            }
            if (options.background) {
                convertArgs.splice(0, 0, '-background', options.background);
                convertArgs.splice(0, 0, '-flatten');
            }
            childProcess.execFile('convert', convertArgs, (childProcessErr) => {
                if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0) {
                    fs.unlinkSync(input);
                }
                if (childProcessErr) throw childProcessErr;
                return null;
            });
        }

        if (fileType === 'other') {
            let hash = crypto.createHash('sha512');
            hash.update(Math.random().toString());
            hash = hash.digest('hex');

            const tempPDF = path.join(os.tmpdir(), `${hash}.pdf`);

            let unoconvPagerange = '1';
            let pagerangeStop = 1;
            if (options.pagerange) {
                const pagerange = options.pagerange.split('-');
                if (pagerange.length === 2) {
                    unoconvPagerange = options.pagerange;
                    [, pagerangeStop] = pagerange;
                }
            }

            if (unoconvPagerange === '1') {
                childProcess.execFile(
                    'unoconv',
                    ['-e', `PageRange=${unoconvPagerange}`, '-o', tempPDF, input],
                    (error) => {
                        if (error) throw error;
                        const convertOtherArgs = [`${tempPDF}[0]`, output];
                        if (options.width > 0 && options.height > 0) {
                            convertOtherArgs.splice(0, 0, '-resize', `${options.width}x${options.height}`);
                        }
                        if (options.quality) {
                            convertOtherArgs.splice(0, 0, '-quality', options.quality);
                        }
                        childProcess.execFile('convert', convertOtherArgs, (childProcessErr) => {
                            if (childProcessErr) throw childProcessErr;

                            fs.unlink(tempPDF, (fsErr) => {
                                if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0) {
                                    fs.unlink(input);
                                }
                                if (fsErr) throw fsErr;
                                return null;
                            });
                        });
                    }
                );
            } else {
                childProcess.execFile(
                    'unoconv',
                    ['-e', `PageRange=${unoconvPagerange}`, '-o', tempPDF, input],
                    (childProcessErr) => {
                        if (childProcessErr) throw childProcessErr;
                        const pages = [];
                        for (let x = 0; x < pagerangeStop; x += 1) {
                            pages.push(x);
                        }
                        async.eachSeries(
                            pages,
                            function iteratee(page, callback) {
                                const convertOtherArgs = [`${tempPDF}[${page}]`, `${page}_${output}`];
                                if (options.width > 0 && options.height > 0) {
                                    convertOtherArgs.splice(0, 0, '-resize', `${options.width}x${options.height}`);
                                }
                                if (options.quality) {
                                    convertOtherArgs.splice(0, 0, '-quality', options.quality);
                                }
                                childProcess.execFile('convert', convertOtherArgs, (error) => {
                                    if (error) callback(error);
                                    return callback();
                                });
                            },
                            function done(err) {
                                if (err) {
                                    throw err;
                                }

                                fs.unlink(tempPDF, (error) => {
                                    if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0) {
                                        fs.unlink(input, () => {});
                                    }
                                    if (error) throw error;
                                    return null;
                                });
                            }
                        );
                    }
                );
            }
        }
    },
};
