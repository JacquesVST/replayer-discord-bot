const dotenv = require('dotenv');
const osuReplayParser = require('osureplayparser');
const axios = require('axios');
const download = require('download');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js'); //import discord.js
dotenv.config();

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
const client = new Client({ intents });
const modes = ['osu', 'taiko', 'fruits', 'mania'];
const approved = ['Graveyard ⚰', 'WIP 🛠', 'Pending 🕒', 'Ranked ⏫', 'Approved ⏫', 'Qualified 🔼', 'Loved ❤'];
const modsList = [
    'NoMod',
    'NoFail',
    'Easy',
    'TouchDevice',
    'Hidden',
    'HardRock',
    'SuddenDeath',
    'DoubleTime',
    'Relax',
    'HalfTime',
    'Nightcore',
    'Flashlight',
    'Autoplay',
    'SpunOut',
    'Relax2',
    'Perfect',
    'Key4',
    'Key5',
    'Key6',
    'Key7',
    'Key8',
    'FadeIn',
    'Random',
    'Cinema',
    'Target',
    'Key9',
    'KeyCoop',
    'Key1',
    'Key3',
    'Key2',
    'ScoreV2',
    'Mirror'
];

function generateEmbeds(replay) {
    replay.is_failed = `${replay.life_bar.split(',').reverse()[1]}`.endsWith('|0') && (replay.mods % 2 == 0);

    const embed = new EmbedBuilder().setColor(0x0099FF)
        .addFields([...generateFields(replay)])
        .setFooter({ text: new Date(replay.timestamp).toLocaleString() });

    let author = { name: replay.playerName };
    if (replay.user) {
        author.iconURL = `https://a.ppy.sh/${replay.user.user_id}`;
        author.url = `https://osu.ppy.sh/users/${replay.user.user_id}`;
    }

    embed.setAuthor(author);

    if (replay.beatmap) {
        const beatmapFullTitle = `${replay.beatmap.artist} - ${replay.beatmap.title} [${replay.beatmap.version}]`;
        const beatmapDescription = `${approved[parseInt(replay.beatmap.approved, 10) + 2]} | ${Number.parseFloat(replay.beatmap.difficultyrating).toFixed(2)}⭐ | ${replay.beatmap.bpm} BPM | ${countSeconds(replay.beatmap.total_length)}`;

        embed.setTitle(beatmapFullTitle)
            .setDescription(beatmapDescription)
            .setURL(`https://osu.ppy.sh/beatmapsets/${replay.beatmap.beatmapset_id}#${modes[replay.beatmap.mode]}/${replay.beatmap.beatmap_id}`)
            .setImage(`https://assets.ppy.sh/beatmaps/${replay.beatmap.beatmapset_id}/covers/cover.jpg`)
    }

    return [embed];
}

function generateFields(replay) {
    const score = `${replay.score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${replay.is_failed ? ' (Failed ❌)' : ''}`;
    const mods = discoverMods(replay.mods);
    const pp = replay.submitted_score ? (replay.submitted_score.pp ? Number.parseFloat(replay.submitted_score.pp).toFixed(2) : '--') : 'Unsubmitted';
    const accuracy = (replay.number_300s + (replay.number_100s / 3) + (replay.number_50s / 6)) / (replay.number_300s + replay.number_100s + replay.number_50s + replay.misses) * 100;
    const hits = `${replay.number_300s} | ${replay.number_100s} | ${replay.number_50s} | ${replay.misses}`
    const combo = `${replay.max_combo}/${(replay?.beatmap?.max_combo ? replay?.beatmap?.max_combo : '')}x${replay.perfect_combo ? ' ✅' : ''}`;

    return [
        { name: 'Score', value: score, inline: true },
        { name: 'Mods', value: mods, inline: true },
        { name: 'pp', value: pp, inline: true },
        { name: 'Accuracy', value: accuracy.toFixed(2) + '%', inline: true },
        { name: '300 | 100 | 50 | Miss', value: hits, inline: true },
        { name: 'Combo', value: combo, inline: true },
    ];
}

function countSeconds(time) {
    const timeInSeconds = parseInt(time, 10);
    let minutes = Math.floor(timeInSeconds / 60);
    let seconds = timeInSeconds - (minutes * 60);

    if (minutes < 10) minutes = "0" + minutes;
    if (seconds < 10) seconds = "0" + seconds;

    return minutes + ':' + seconds;
}

function discoverMods(mods) {
    const binary = ((mods >>> 0).toString(2) + '0').split('').reverse();

    const convertedModsList = mods > 0 ? modsList.filter((item, index) => binary[index] == 1) : [modsList[0]];

    return convertedModsList.join();
}

client.on('ready', () => {
    client.user.setStatus('invisible');
    console.log(client.user.tag);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const [osr] = message?.attachments.values();
    const urlFile = osr?.attachment;

    if (urlFile && urlFile.endsWith('.osr')) {
        try {
            const destination = "replayData/replay.osr";

            fs.writeFileSync(destination, await download(urlFile));

            const replay = osuReplayParser.parseReplay("./" + destination);

            if (replay) {

                const osuURL = 'https://osu.ppy.sh/api/';
                const getMapURL = `${osuURL}/get_beatmaps?k=${process.env.OSU_API}&h=${replay.beatmapMD5}`;
                const getUserURL = `${osuURL}/get_user?k=${process.env.OSU_API}&u=${replay.playerName}&type=string&m=${replay.gameMode}`;

                let beatmap = (await axios.get(getMapURL))?.data[0];
                if (beatmap) {
                    replay.beatmap = beatmap;
                }

                let user = (await axios.get(getUserURL))?.data[0];
                if (user) {
                    replay.user = user;
                }

                if (user && beatmap) {
                    const getScoreURL = `${osuURL}/get_scores?k=${process.env.OSU_API}&b=${replay.beatmap.beatmap_id}&u=${replay.user.user_id}&type=id&m=${replay.gameMode}`;

                    let scores = (await axios.get(getScoreURL))?.data;
                    replay.submitted_score = scores.filter(item => item.score == replay.score)[0];
                }

                message.reply({ embeds: generateEmbeds(replay) });
            } else {
                message.reply('Não me parece um arquivo de replay .osr válido');
            }
        } catch (err) {
            console.error(err);
            message.reply('Não foi possivel identificar o arquivo .osr');
        }
    }
});

client.login(process.env.CLIENT_TOKEN);