const { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, IntentsBitField, ChannelType, PermissionFlagsBits, REST, Routes, AttachmentBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const moment = require('moment-timezone');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMembers,
    ],
});

// تسجيل الأوامر (Slash Commands)
const commands = [
    {
        name: 'ticket',
        description: 'فتح تذكرة جديدة',
    },
];

const rest = new REST({ version: '10' }).setToken(settings.TOKEN);

(async () => {
    try {
        console.log('جاري تسجيل الأوامر...');
        await rest.put(Routes.applicationCommands(settings.CLIENT_ID), { body: commands });
        console.log('تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error(`خطأ في تسجيل الأوامر: ${error.message}`);
    }
})();

const openTickets = new Map();

client.once('ready', () => {
    console.log(`تم تسجيل الدخول بنجاح كـ ${client.user.tag}!`);
    client.user.setActivity('ArabicMc', { type: 'PLAYING' });
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() && !interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    try {
        if (interaction.isCommand() && interaction.commandName === 'ticket') {
            await interaction.deferReply();
            const panelEmbed = new EmbedBuilder()
                .setTitle(settings.PANEL_TITLE)
                .setDescription(settings.PANEL_DESCRIPTION)
                .setColor(settings.PANEL_COLOR)
                .setImage(settings.IMAGE_URL)
                .setThumbnail(settings.THUMBNAIL_URL);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_type')
                .setPlaceholder('اختر نوع التذكرة')
                .addOptions(settings.TICKET_TYPES.map(type => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(type.label)
                        .setEmoji(type.emoji)
                        .setDescription(type.description)
                        .setValue(type.value)
                ));

            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.editReply({ embeds: [panelEmbed], components: [row] });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
            const ticketTypeValue = interaction.values[0];
            console.log(`القيمة المرجعة لنوع التذكرة: ${ticketTypeValue}`);
            const ticketType = settings.TICKET_TYPES.find(t => t.value === ticketTypeValue);
            if (!ticketType) {
                console.log(`خطأ: نوع التذكرة غير صالح - ${ticketTypeValue}`);
                console.log(`أنواع التذاكر المتاحة: ${JSON.stringify(settings.TICKET_TYPES.map(t => t.value))}`);
                await interaction.reply({ content: 'خطأ: نوع التذكرة غير صالح! تأكد من إعدادات التذاكر في الداشبورد.', flags: 64 });
                return;
            }

            const ticketNumber = (openTickets.size + 1).toString().padStart(2, '0');
            const ticketChannelName = `${ticketType.prefix}-${ticketNumber}`;
            const categoryId = ticketType.category || null;

            const mentionRole = (ticketType.value === 'report' || ticketType.value === 'buy' || ticketType.value === 'mazen_helper') ? settings.HIGHER_ROLE_ID : settings.STAFF_ROLE_ID;

            if (!mentionRole) {
                await interaction.reply({ content: 'خطأ: لم يتم تحديد رول الدعم أو الإدارة العليا! تأكد من إعدادات الرول في الداشبورد.', flags: 64 });
                return;
            }

            const ticketChannel = await interaction.guild.channels.create({
                name: ticketChannelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: mentionRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                ],
            });

            const ticketCreationDate = moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss');
            const currentTime = moment().tz('Africa/Cairo').format('h:mm A');

            const formattedTicketMessage = settings.TICKET_MESSAGE.replace('{role}', ticketType.value === 'support' ? 'الدعم' : 'الإدارة العليا');
            const ticketEmbed = new EmbedBuilder()
                .setTitle(`تذكرة ${ticketType.prefix} رقم ${ticketNumber}`)
                .setDescription(`\`\`\`\n${formattedTicketMessage}\n\`\`\``)
                .addFields({ name: '\u200B', value: `Today at ${currentTime}`, inline: true })
                .setColor('#0000ff')
                .setImage(settings.TICKET_IMAGE_URL)
                .setFooter({ text: `${interaction.user.tag} | Date: ${ticketCreationDate}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_options').setLabel('خيــــارات').setStyle(ButtonStyle.Secondary).setEmoji('1347940855486611517'),
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('استـــلام').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('اغـــلاق').setStyle(ButtonStyle.Danger).setEmoji('1350600542946328607')
            );

            const ticketMessageSent = await ticketChannel.send({ content: `<@&${mentionRole}> | ${interaction.user}`, embeds: [ticketEmbed], components: [buttons] });
            openTickets.set(ticketChannel.id, { 
                name: `${ticketType.prefix}-${ticketNumber}`, 
                owner: interaction.user.id, 
                claimedBy: null, 
                messageId: ticketMessageSent.id, 
                roleId: mentionRole,
                ticketTypeValue: ticketType.value,
                claimMessageId: null,
                requestMessageId: null
            });

            console.log(`openTickets بعد فتح التذكرة: ${JSON.stringify([...openTickets.entries()])}`);

            await interaction.reply({ content: `تم فتح تذكرة بنجاح! اذهب إلى ${ticketChannel}`, flags: 64 });
        }

        if (interaction.isButton() && interaction.customId === 'claim_ticket') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData) {
                return interaction.reply({ content: 'لم يتم العثور على بيانات التذكرة!', flags: 64 });
            }

            if (ticketData.claimedBy) {
                return interaction.reply({ content: 'تم استلام التذكرة بالفعل! يمكنك طلب الاستلام باستخدام زر "طلب استلام".', flags: 64 });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(ticketData.roleId)) {
                return interaction.reply({ content: 'ليس لديك الصلاحية لاستلام هذه التذكرة!', flags: 64 });
            }

            ticketData.claimedBy = interaction.user.id;
            openTickets.set(interaction.channel.id, ticketData);

            // تعديل أذونات القناة للسماح فقط لصاحب التذكرة والمستلم بالكتابة
            await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
                SendMessages: false,
            });
            await interaction.channel.permissionOverwrites.edit(ticketData.owner, {
                SendMessages: true,
            });
            await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                SendMessages: true,
            });

            // تعديل الزر ليصبح "مستلمة"
            const updatedButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_options').setLabel('خيــــارات').setStyle(ButtonStyle.Secondary).setEmoji('1347940855486611517'),
                new ButtonBuilder().setCustomId('claimed_ticket').setLabel('مستلمة').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('اغـــلاق').setStyle(ButtonStyle.Danger).setEmoji('1350600542946328607')
            );

            const ticketMessage = await interaction.channel.messages.fetch(ticketData.messageId);
            await ticketMessage.edit({ components: [updatedButtons] });

            // إنشاء الـ Embed المخصص
            const claimDate = moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss');
            const ownerUser = await client.users.fetch(ticketData.owner);
            const claimEmbed = new EmbedBuilder()
                .setTitle(settings.CLAIM_EMBED_TITLE)
                .setDescription(
                    settings.CLAIM_EMBED_DESCRIPTION
                        .replace('{claimer}', interaction.user.toString())
                        .replace('{owner}', ownerUser.toString())
                )
                .setColor(settings.CLAIM_EMBED_COLOR)
                .setFooter({
                    text: settings.CLAIM_EMBED_FOOTER.replace('{date}', claimDate),
                    iconURL: settings.CLAIM_EMBED_FOOTER_ICON || undefined
                });

            // إضافة زرين: "طلب استلام" و"ترك"
            const claimButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('request_claim_ticket')
                    .setLabel('طلب استلام')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('leave_ticket')
                    .setLabel('ترك')
                    .setStyle(ButtonStyle.Danger)
            );

            // إرسال الـ Embed مع الأزرار
            const claimMessage = await interaction.channel.send({ embeds: [claimEmbed], components: [claimButtons] });
            ticketData.claimMessageId = claimMessage.id;
            openTickets.set(interaction.channel.id, ticketData);

            await interaction.reply({ content: `تم استلام التذكرة بنجاح!`, flags: 64 });
        }

        if (interaction.isButton() && interaction.customId === 'leave_ticket') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData) {
                return interaction.reply({ content: 'لم يتم العثور على بيانات التذكرة!', flags: 64 });
            }

            if (ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه ترك التذكرة!', flags: 64 });
            }

            ticketData.claimedBy = null;
            openTickets.set(interaction.channel.id, ticketData);

            // إعادة الأذونات إلى الحالة الأصلية
            await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
                SendMessages: null,
            });
            await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                SendMessages: null,
            });

            // إعادة الزر إلى "استلام"
            const updatedButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_options').setLabel('خيــــارات').setStyle(ButtonStyle.Secondary).setEmoji('1347940855486611517'),
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('استـــلام').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('اغـــلاق').setStyle(ButtonStyle.Danger).setEmoji('1350600542946328607')
            );

            const ticketMessage = await interaction.channel.messages.fetch(ticketData.messageId);
            await ticketMessage.edit({ components: [updatedButtons] });

            // تعديل الـ Embed لإظهار أن التذكرة متاحة للاستلام
            const claimEmbed = new EmbedBuilder()
                .setTitle(settings.CLAIM_EMBED_TITLE)
                .setDescription('التذكرة متاحة للاستلام الآن.')
                .setColor(settings.CLAIM_EMBED_COLOR)
                .setFooter({
                    text: settings.CLAIM_EMBED_FOOTER.replace('{date}', moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss')),
                    iconURL: settings.CLAIM_EMBED_FOOTER_ICON || undefined
                });

            const updatedClaimButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('request_claim_ticket')
                    .setLabel('طلب استلام')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('leave_ticket')
                    .setLabel('ترك')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

            const claimMessage = await interaction.channel.messages.fetch(ticketData.claimMessageId);
            await claimMessage.edit({ embeds: [claimEmbed], components: [updatedClaimButtons] });

            await interaction.reply({ content: 'تم ترك التذكرة بنجاح!', flags: 64 });
        }

        if (interaction.isButton() && interaction.customId === 'request_claim_ticket') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData) {
                return interaction.reply({ content: 'لم يتم العثور على بيانات التذكرة!', flags: 64 });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            // السماح لكل من الإدارة العادية والعليا بطلب الاستلام
            if (!member.roles.cache.has(settings.STAFF_ROLE_ID) && !member.roles.cache.has(settings.HIGHER_ROLE_ID)) {
                return interaction.reply({ content: 'فقط الإدارة يمكنهم طلب استلام التذكرة!', flags: 64 });
            }

            if (!ticketData.claimedBy) {
                // إذا لم تكن التذكرة مستلمة بعد، يمكن استلامها مباشرة
                ticketData.claimedBy = interaction.user.id;
                openTickets.set(interaction.channel.id, ticketData);

                // تعديل أذونات القناة للسماح فقط لصاحب التذكرة والمستلم بالكتابة
                await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
                    SendMessages: false,
                });
                await interaction.channel.permissionOverwrites.edit(ticketData.owner, {
                    SendMessages: true,
                });
                await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                    SendMessages: true,
                });

                // تعديل الزر ليصبح "مستلمة"
                const updatedButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ticket_options').setLabel('خيــــارات').setStyle(ButtonStyle.Secondary).setEmoji('1347940855486611517'),
                    new ButtonBuilder().setCustomId('claimed_ticket').setLabel('مستلمة').setStyle(ButtonStyle.Success).setDisabled(true),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('اغـــلاق').setStyle(ButtonStyle.Danger).setEmoji('1350600542946328607')
                );

                const ticketMessage = await interaction.channel.messages.fetch(ticketData.messageId);
                await ticketMessage.edit({ components: [updatedButtons] });

                // تعديل الـ Embed لإظهار أن التذكرة تم استلامها
                const claimDate = moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss');
                const ownerUser = await client.users.fetch(ticketData.owner);
                const claimEmbed = new EmbedBuilder()
                    .setTitle(settings.CLAIM_EMBED_TITLE)
                    .setDescription(
                        settings.CLAIM_EMBED_DESCRIPTION
                            .replace('{claimer}', interaction.user.toString())
                            .replace('{owner}', ownerUser.toString())
                    )
                    .setColor(settings.CLAIM_EMBED_COLOR)
                    .setFooter({
                        text: settings.CLAIM_EMBED_FOOTER.replace('{date}', claimDate),
                        iconURL: settings.CLAIM_EMBED_FOOTER_ICON || undefined
                    });

                const updatedClaimButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('request_claim_ticket')
                        .setLabel('طلب استلام')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('leave_ticket')
                        .setLabel('ترك')
                        .setStyle(ButtonStyle.Danger)
                );

                const claimMessage = await interaction.channel.messages.fetch(ticketData.claimMessageId);
                await claimMessage.edit({ embeds: [claimEmbed], components: [updatedClaimButtons] });

                await interaction.reply({ content: `تم استلام التذكرة بنجاح!`, flags: 64 });
                return;
            }

            if (ticketData.claimedBy === interaction.user.id) {
                return interaction.reply({ content: 'أنت بالفعل المستلم لهذه التذكرة!', flags: 64 });
            }

            // إرسال طلب الاستلام للمستلم الحالي
            const requester = interaction.user;
            const claimer = await client.users.fetch(ticketData.claimedBy);
            const requestDate = moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss');
            
            const requestEmbed = new EmbedBuilder()
                .setTitle(settings.REQUEST_EMBED_TITLE)
                .setDescription(
                    settings.REQUEST_EMBED_DESCRIPTION
                        .replace('{requester}', requester.toString())
                        .replace('{claimer}', claimer.toString())
                )
                .setColor(settings.REQUEST_EMBED_COLOR)
                .setFooter({
                    text: settings.REQUEST_EMBED_FOOTER.replace('{date}', requestDate),
                });

            const requestButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_request_${interaction.user.id}`)
                    .setLabel('موافق')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`reject_request_${interaction.user.id}`)
                    .setLabel('رافض')
                    .setStyle(ButtonStyle.Danger)
            );

            const requestMessage = await interaction.channel.send({ content: `<@${ticketData.claimedBy}>`, embeds: [requestEmbed], components: [requestButtons] });
            ticketData.requestMessageId = requestMessage.id;
            openTickets.set(interaction.channel.id, ticketData);

            await interaction.reply({ content: `تم إرسال طلب الاستلام إلى ${claimer.tag}!`, flags: 64 });
        }

        if (interaction.isButton() && interaction.customId.startsWith('approve_request_')) {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData) {
                return interaction.reply({ content: 'لم يتم العثور على بيانات التذكرة!', flags: 64 });
            }

            if (ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم الحالي يمكنه الموافقة على الطلب!', flags: 64 });
            }

            const requesterId = interaction.customId.split('_')[2];
            const requester = await client.users.fetch(requesterId);

            // نقل استلام التذكرة إلى الطالب
            const previousClaimer = ticketData.claimedBy;
            ticketData.claimedBy = requesterId;
            openTickets.set(interaction.channel.id, ticketData);

            // تعديل الأذونات
            await interaction.channel.permissionOverwrites.edit(previousClaimer, {
                SendMessages: null,
            });
            await interaction.channel.permissionOverwrites.edit(requesterId, {
                SendMessages: true,
            });

            // تعديل الـ Embed الأصلي
            const claimDate = moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss');
            const ownerUser = await client.users.fetch(ticketData.owner);
            const claimEmbed = new EmbedBuilder()
                .setTitle(settings.CLAIM_EMBED_TITLE)
                .setDescription(
                    settings.CLAIM_EMBED_DESCRIPTION
                        .replace('{claimer}', `<@${requesterId}>`)
                        .replace('{owner}', ownerUser.toString())
                )
                .setColor(settings.CLAIM_EMBED_COLOR)
                .setFooter({
                    text: settings.CLAIM_EMBED_FOOTER.replace('{date}', claimDate),
                    iconURL: settings.CLAIM_EMBED_FOOTER_ICON || undefined
                });

            const updatedClaimButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('request_claim_ticket')
                    .setLabel('طلب استلام')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('leave_ticket')
                    .setLabel('ترك')
                    .setStyle(ButtonStyle.Danger)
            );

            const claimMessage = await interaction.channel.messages.fetch(ticketData.claimMessageId);
            await claimMessage.edit({ embeds: [claimEmbed], components: [updatedClaimButtons] });

            // تعديل رسالة الطلب
            const requestMessage = await interaction.channel.messages.fetch(ticketData.requestMessageId);
            const updatedRequestEmbed = new EmbedBuilder()
                .setTitle('تمت الموافقة على طلب الاستلام ✅')
                .setDescription(`تم نقل استلام التذكرة إلى ${requester.toString()} بموافقة ${interaction.user.toString()}.`)
                .setColor('#00ff00')
                .setFooter({
                    text: settings.REQUEST_EMBED_FOOTER.replace('{date}', moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss')),
                });

            await requestMessage.edit({ embeds: [updatedRequestEmbed], components: [] });

            await interaction.reply({ content: `تمت الموافقة على طلب الاستلام! التذكرة الآن مع ${requester.tag}.`, flags: 64 });
        }

        if (interaction.isButton() && interaction.customId.startsWith('reject_request_')) {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData) {
                return interaction.reply({ content: 'لم يتم العثور على بيانات التذكرة!', flags: 64 });
            }

            if (ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم الحالي يمكنه رفض الطلب!', flags: 64 });
            }

            const requesterId = interaction.customId.split('_')[2];
            const requester = await client.users.fetch(requesterId);

            // تعديل رسالة الطلب
            const requestMessage = await interaction.channel.messages.fetch(ticketData.requestMessageId);
            const updatedRequestEmbed = new EmbedBuilder()
                .setTitle('تم رفض طلب الاستلام ❌')
                .setDescription(`${interaction.user.toString()} رفض طلب الاستلام من ${requester.toString()}.`)
                .setColor('#ff0000')
                .setFooter({
                    text: settings.REQUEST_EMBED_FOOTER.replace('{date}', moment().tz('Africa/Cairo').format('DD/MM/YYYY HH:mm:ss')),
                });

            await requestMessage.edit({ embeds: [updatedRequestEmbed], components: [] });

            await interaction.reply({ content: `تم رفض طلب الاستلام من ${requester.tag}!`, flags: 64 });
        }

        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData) {
                return;
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(ticketData.roleId) && interaction.user.id !== ticketData.owner) {
                return interaction.reply({ content: 'ليس لديك الصلاحية لإغلاق هذه التذكرة!', flags: 64 });
            }

            // إنشاء الترانسكربت إذا كان مفعلاً
            if (settings.ENABLE_TRANSCRIPT) {
                try {
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                    let transcriptContent = `
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>🔒・${ticketData.name}</title>
    <style>
        @import url('https://fonts.bunny.net/css?family=roboto:400,500,700');
        @font-face{font-family:'Whitney';src:url('https://cdn.jsdelivr.net/gh/ItzDerock/discord-components@master/assets/fonts/Book.woff') format('woff');font-weight:400;font-display:swap}
        @font-face{font-family:'Whitney';src:url('https://cdn.jsdelivr.net/gh/ItzDerock/discord-components@master/assets/fonts/Medium.woff') format('woff');font-weight:500;font-display:swap}
        @font-face{font-family:'Whitney';src:url('https://cdn.jsdelivr.net/gh/ItzDerock/discord-components@master/assets/fonts/Semibold.woff') format('woff');font-weight:600;font-display:swap}
        @font-face{font-family:'Whitney';src:url('https://cdn.jsdelivr.net/gh/ItzDerock/discord-components@master/assets/fonts/Bold.woff') format('woff');font-weight:700;font-display:swap}
        .discord-messages{color:#fff;background-color:#36393e;display:block;font-size:16px;font-family:Whitney, 'Source Sans Pro', ui-sans-serif, system-ui, -apple-system, 'system-ui', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';line-height:170%;border:1px solid rgba(255, 255, 255, 0.05)}
        .discord-message{color:#dcddde;display:flex;flex-direction:column;font-size:0.9em;font-family:Whitney, 'Source Sans Pro', ui-sans-serif, system-ui, -apple-system, 'system-ui', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';padding:0px 1em;position:relative;word-wrap:break-word;-webkit-user-select:text;-moz-user-select:text;-ms-user-select:text;user-select:text;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto;padding-right:0;min-height:1.375rem;padding-right:48px !important;margin-top:1.0625rem}
        .discord-message .discord-message-inner{display:flex;position:relative;-webkit-box-flex:0;-ms-flex:0 0 auto;flex:0 0 auto}
        .discord-message .discord-author-avatar{margin-right:16px;margin-top:5px;min-width:40px;z-index:1}
        .discord-message .discord-author-avatar img{width:40px;height:40px;border-radius:50%}
        .discord-message .discord-author-info{display:inline-flex;align-items:center;font-size:16px;margin-right:0.25rem}
        .discord-message .discord-author-info .discord-author-username{color:#fff;font-size:1em;font-weight:500}
        .discord-message .discord-message-timestamp{color:#72767d;font-size:12px;margin-left:3px}
        .discord-message .discord-message-content{width:100%;line-height:160%;font-weight:normal;padding-top:2px}
        .discord-message .discord-message-body{font-size:1rem;font-weight:400;word-break:break-word;position:relative}
        .discord-header{display:flex;flex-direction:row;max-height:5rem;padding:0.5rem;gap:0.5rem;border-bottom:1px solid rgba(79, 84, 92, 0.48)}
        .discord-header-icon{float:left;width:5rem}
        .discord-header-icon>img{border-radius:50%;width:auto;height:100%}
        .discord-header-text{flex-grow:1}
        .discord-header-text-guild{font-size:1.5rem;font-weight:bold}
        .discord-embed{color:#dcddde;display:flex;font-size:13px;line-height:150%;margin-bottom:2px;margin-top:2px}
        .discord-embed .discord-left-border{background-color:#202225;border-radius:4px 0 0 4px;flex-shrink:0;width:4px}
        .discord-embed .discord-embed-root{display:grid;grid-auto-flow:row;grid-row-gap:0.25rem;min-height:0;min-width:0;text-indent:0}
        .discord-embed .discord-embed-wrapper{background-color:#2f3136;max-width:520px;border:1px solid rgba(46, 48, 54, 0.6);border-radius:0 4px 4px 0;justify-self:start;align-self:start;display:grid;box-sizing:border-box}
        .discord-embed .discord-embed-grid{display:inline-grid;grid-template-columns:auto;grid-template-rows:auto;padding:0.5rem 1rem 1rem 0.75rem}
        .discord-embed .discord-embed-title{color:#fff;display:inline-block;font-size:1rem;font-weight:600;grid-column:1 / 1;margin-top:8px;min-width:0}
        .discord-embed .discord-embed-field{font-size:0.875rem;line-height:1.125rem;min-width:0;font-weight:400;grid-column:1/13}
        .discord-embed .discord-embed-field .discord-field-title{color:#ffffff;font-weight:600;font-size:0.875rem;line-height:1.125rem;min-width:0;margin-bottom:2px}
        .discord-embed .discord-embed-field.discord-inline-field{flex-grow:1;flex-basis:auto;min-width:150px}
        .discord-embed .discord-embed-media{border-radius:4px;contain:paint;display:block;grid-column:1/1;margin-top:16px}
        .discord-embed .discord-embed-image{border-radius:4px;max-width:100%}
        .discord-action-row{display:flex;flex-wrap:nowrap}
        .discord-button{display:flex;justify-content:center;align-items:center;cursor:pointer;margin:4px 8px 4px 0;padding:2px 16px;width:auto;height:32px;min-width:60px;min-height:32px;-webkit-transition:background-color 0.17s ease, color 0.17s ease;transition:background-color 0.17s ease, color 0.17s ease;border-radius:3px;font-size:14px;font-weight:500;line-height:16px;text-decoration:none !important}
        .discord-button.discord-button-success{color:#fff;background-color:#3ba55d}
        .discord-button.discord-button-destructive{color:#fff;background-color:#ed4245}
        .discord-button.discord-button-primary{color:#fff;background-color:#5865f2}
        .discord-button.discord-button-secondary{color:#fff;background-color:#4f545c}
        .discord-button .discord-button-emoji{margin-right:4px;object-fit:contain;width:1.375em;height:1.375em;vertical-align:bottom}
    </style>
</head>
<body style="margin:0;min-height:100vh">
    <discord-messages style="min-height:100vh" class="discord-messages">
        <discord-header guild="ArabicMc" channel="🔒・${ticketData.name}" icon="https://cdn.discordapp.com/icons/996900903992971346/a5fea43848cb7d4fef774f3688987c44.webp" class="discord-header">
            <div class="discord-header-icon">
                <img src="https://cdn.discordapp.com/icons/996900903992971346/a5fea43848cb7d4fef774f3688987c44.webp" alt="guild icon">
            </div>
            <div class="discord-header-text">
                <div class="discord-header-text-guild">ArabicMc</div>
                <div class="discord-header-text-channel">#🔒・${ticketData.name}</div>
            </div>
        </discord-header>
`;

                    for (const message of sortedMessages.values()) {
                        const author = await client.users.fetch(message.author.id);
                        const timestamp = moment(message.createdTimestamp).tz('Africa/Cairo').format('DD/MM/YYYY h:mm A');
                        let content = message.content || '';

                        // التعامل مع الـ Embeds
                        let embedContent = '';
                        if (message.embeds.length > 0) {
                            const embed = message.embeds[0];
                            embedContent += `
        <discord-embed embed-title="${embed.title || 'No Title'}" description="${embed.description || 'No Description'}" color="${embed.hexColor || '#0000ff'}">
            <div class="discord-embed">
                <div class="discord-left-border" style="background-color: ${embed.hexColor || '#0000ff'};"></div>
                <div class="discord-embed-root">
                    <div class="discord-embed-wrapper">
                        <div class="discord-embed-grid">
                            <div class="discord-embed-title">${embed.title || 'No Title'}</div>
                            <div class="discord-embed-description">${embed.description || 'No Description'}</div>
`;
                            if (embed.fields.length > 0) {
                                for (const field of embed.fields) {
                                    embedContent += `
                            <discord-embed-field field-title="${field.name}" field-value="${field.value}" inline="${field.inline ? 'true' : 'false'}">
                                <div class="discord-embed-field ${field.inline ? 'discord-inline-field' : ''}">
                                    <div class="discord-field-title">${field.name}</div>
                                    ${field.value}
                                </div>
                            </discord-embed-field>
`;
                                }
                            }
                            if (embed.image) {
                                embedContent += `
                            <div class="discord-embed-media">
                                <img src="${embed.image.url}" alt="Discord embed media" class="discord-embed-image">
                            </div>
`;
                            }
                            embedContent += `
                        </div>
                    </div>
                </div>
            </div>
        </discord-embed>
`;
                        }

                        // التعامل مع الأزرار
                        let componentsContent = '';
                        if (message.components.length > 0) {
                            componentsContent += `
        <discord-attachments slot="components" class="discord-attachments">
            <discord-action-row class="discord-action-row">
`;
                            for (const component of message.components[0].components) {
                                const buttonStyle = component.style === ButtonStyle.Success ? 'success' :
                                                    component.style === ButtonStyle.Danger ? 'danger' :
                                                    component.style === ButtonStyle.Primary ? 'primary' :
                                                    component.style === ButtonStyle.Secondary ? 'secondary' : 'primary';
                                const emoji = component.emoji ? `<img src="${component.emoji.url || `https://cdn.discordapp.com/emojis/${component.emoji.id}.png`}" alt="emoji" class="discord-button-emoji">` : '';
                                componentsContent += `
                <discord-button type="${buttonStyle}" ${component.disabled ? 'disabled' : ''}>
                    ${emoji}
                    <span>${component.label}</span>
                </discord-button>
`;
                            }
                            componentsContent += `
            </discord-action-row>
        </discord-attachments>
`;
                        }

                        transcriptContent += `
        <discord-message author="${author.username}" avatar="${author.displayAvatarURL()}" timestamp="${timestamp}">
            <div class="discord-message-content">
                <div class="discord-message-body">${content || '[No Content]'}</div>
                ${embedContent}
                ${componentsContent}
            </div>
        </discord-message>
`;
                    }

                    transcriptContent += `
        <div style="text-align:center;width:100%">Exported ${sortedMessages.size} messages.</div>
    </discord-messages>
</body>
</html>`;

                    const transcriptFile = new AttachmentBuilder(Buffer.from(transcriptContent), { name: `transcript-${ticketData.name}.html` });

                    // إرسال الترانسكربت إلى قناة محددة
                    if (settings.TRANSCRIPT_CHANNEL_ID) {
                        const transcriptChannel = await client.channels.fetch(settings.TRANSCRIPT_CHANNEL_ID);
                        if (transcriptChannel) {
                            await transcriptChannel.send({
                                content: `ترانسكربت تذكرة: **${ticketData.name}**`,
                                files: [transcriptFile],
                            });
                        }
                    }

                    // إرسال الترانسكربت على الخاص لصاحب التذكرة
                    const ticketOwner = await client.users.fetch(ticketData.owner);
                    await ticketOwner.send({
                        content: `تم إغلاق تذكرتك: **${ticketData.name}**. إليك الترانسكربت:`,
                        files: [transcriptFile],
                    }).catch(err => console.error(`فشل في إرسال الترانسكربت على الخاص: ${err.message}`));
                } catch (error) {
                    console.error(`خطأ في إنشاء الترانسكربت: ${error.message}`);
                }
            }

            await interaction.channel.delete();
            openTickets.delete(interaction.channel.id);
        }

        if (interaction.isButton() && interaction.customId === 'ticket_options') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData) {
                return interaction.reply({ content: 'لم يتم العثور على بيانات التذكرة!', flags: 64 });
            }

            if (ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه استخدام خيارات التذكرة!', flags: 64 });
            }

            const optionsEmbed = new EmbedBuilder()
                .setTitle('خيارات التذكرة')
                .setDescription('اختر إجراءً من القائمة أدناه:')
                .setColor('#ffff00');

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_action')
                .setPlaceholder('اختر خيارًا')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('تغيير اسم التذكرة').setEmoji('✍️').setValue('rename_ticket'),
                    new StringSelectMenuOptionBuilder().setLabel('إضافة عضو').setEmoji('✅').setValue('add_member'),
                    new StringSelectMenuOptionBuilder().setLabel('حذف عضو').setEmoji('❌').setValue('remove_member'),
                    new StringSelectMenuOptionBuilder().setLabel('إعادة تحميل').setEmoji('🔄').setValue('reload_ticket'),
                    new StringSelectMenuOptionBuilder().setLabel('نداء المستلم أو الفاتح').setEmoji('📢').setValue('ping_owner_or_claimer')
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.reply({ embeds: [optionsEmbed], components: [row], flags: 64 });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_action') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData || ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه استخدام خيارات التذكرة!', flags: 64 });
            }

            const selectedOption = interaction.values[0];

            try {
                if (selectedOption === 'rename_ticket') {
                    if (openTickets.size === 0) {
                        return interaction.reply({ content: 'لا توجد تذاكر مفتوحة حاليًا!', flags: 64 });
                    }

                    const ticketSelectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_ticket_to_rename')
                        .setPlaceholder('اختر تذكرة لتغيير اسمها')
                        .addOptions(
                            Array.from(openTickets.entries()).map(([channelId, ticket]) =>
                                new StringSelectMenuOptionBuilder().setLabel(ticket.name).setValue(channelId)
                            )
                        );

                    const row = new ActionRowBuilder().addComponents(ticketSelectMenu);
                    await interaction.reply({ content: 'اختر التذكرة التي تريد تغيير اسمها:', components: [row], flags: 64 });
                }

                if (selectedOption === 'add_member') {
                    const modal = new ModalBuilder()
                        .setCustomId('add_member_modal')
                        .setTitle('إضافة عضو إلى التذكرة');

                    const userIdInput = new TextInputBuilder()
                        .setCustomId('user_id')
                        .setLabel('أيدي العضو')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('اكتب أيدي العضو هنا (مثال: 123456789)')
                        .setRequired(true)
                        .setMinLength(17)
                        .setMaxLength(19);

                    const row = new ActionRowBuilder().addComponents(userIdInput);
                    modal.addComponents(row);

                    await interaction.showModal(modal);
                    console.log(`تم عرض مودال إضافة عضو لـ ${interaction.user.tag}`);
                    return;
                }

                if (selectedOption === 'remove_member') {
                    const modal = new ModalBuilder()
                        .setCustomId('remove_member_modal')
                        .setTitle('حذف عضو من التذكرة');

                    const userIdInput = new TextInputBuilder()
                        .setCustomId('user_id')
                        .setLabel('أيدي العضو')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('اكتب أيدي العضو هنا (مثال: 123456789)')
                        .setRequired(true)
                        .setMinLength(17)
                        .setMaxLength(19);

                    const row = new ActionRowBuilder().addComponents(userIdInput);
                    modal.addComponents(row);

                    await interaction.showModal(modal);
                    console.log(`تم عرض مودال حذف عضو لـ ${interaction.user.tag}`);
                    return;
                }

                if (selectedOption === 'reload_ticket') {
                    await interaction.channel.send('تم إعادة تحميل التذكرة!');
                    await interaction.reply({ content: 'تم إعادة تحميل التذكرة بنجاح!', flags: 64 });
                }

                if (selectedOption === 'ping_owner_or_claimer') {
                    if (!ticketData) {
                        return interaction.reply({ content: 'لم يتم العثور على بيانات التذكرة!', flags: 64 });
                    }

                    console.log(`بيانات التذكرة: ${JSON.stringify(ticketData)}`);

                    if (!ticketData.owner || !/^\d+$/.test(ticketData.owner)) {
                        console.log(`أيدي الفاتح غير صالح: ${ticketData.owner}`);
                        return interaction.reply({ content: `خطأ: أيدي الفاتح غير صالح! أيدي الفاتح: ${ticketData.owner}`, flags: 64 });
                    }

                    let ownerExists = false;
                    let ownerUser = null;
                    try {
                        ownerUser = await interaction.guild.members.fetch(ticketData.owner);
                        ownerExists = true;
                        console.log(`تم العثور على الفاتح: ${ownerUser.user.tag} (${ticketData.owner})`);
                    } catch (error) {
                        console.log(`فشل في جلب الفاتح: ${ticketData.owner}, الخطأ: ${error.message}`);
                    }

                    let claimerExists = false;
                    let claimerUser = null;
                    if (ticketData.claimedBy) {
                        if (!/^\d+$/.test(ticketData.claimedBy)) {
                            console.log(`أيدي المستلم غير صالح: ${ticketData.claimedBy}`);
                            return interaction.reply({ content: `خطأ: أيدي المستلم غير صالح! أيدي المستلم: ${ticketData.claimedBy}`, flags: 64 });
                        }

                        try {
                            claimerUser = await interaction.guild.members.fetch(ticketData.claimedBy);
                            claimerExists = true;
                            console.log(`تم العثور على المستلم: ${claimerUser.user.tag} (${ticketData.claimedBy})`);
                        } catch (error) {
                            console.log(`فشل في جلب المستلم: ${ticketData.claimedBy}, الخطأ: ${error.message}`);
                        }
                    }

                    if (!ownerExists && !claimerExists) {
                        return interaction.reply({ content: `لا يوجد أعضاء متاحون للنداء!\n- أيدي الفاتح: ${ticketData.owner}\n- أيدي المستلم: ${ticketData.claimedBy || 'لا يوجد مستلم'}`, flags: 64 });
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_user_to_ping')
                        .setPlaceholder('اختر من تريد نداءه');

                    if (ownerExists) {
                        selectMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`نداء الفاتح (${ownerUser.user.tag})`).setEmoji('👤').setValue(`ping_owner_${ticketData.owner}`));
                    }

                    if (claimerExists) {
                        selectMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`نداء المستلم (${claimerUser.user.tag})`).setEmoji('🛠️').setValue(`ping_claimer_${ticketData.claimedBy}`));
                    }

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    await interaction.reply({ content: 'اختر من تريد نداءه:', components: [row], flags: 64 });
                }
            } catch (error) {
                console.error(`خطأ في معالجة ticket_action (${selectedOption}): ${error.message}\nStack: ${error.stack}`);
                await interaction.reply({ content: `حدث خطأ أثناء معالجة الخيار: ${error.message}، حاول مرة أخرى!`, flags: 64 });
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_user_to_ping') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData || ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه استخدام خيارات التذكرة!', flags: 64 });
            }

            const selectedValue = interaction.values[0];
            const [action, userId] = selectedValue.split('_');

            if (action === 'ping_owner') {
                await interaction.channel.send(`<@${userId}>`);
                await interaction.reply({ content: `تم نداء الفاتح بنجاح!`, flags: 64 });
            } else if (action === 'ping_claimer') {
                await interaction.channel.send(`<@${userId}>`);
                await interaction.reply({ content: `تم نداء المستلم بنجاح!`, flags: 64 });
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_to_rename') {
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData || ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه تغيير اسم التذكرة!', flags: 64 });
            }

            const selectedChannelId = interaction.values[0];
            const modal = new ModalBuilder()
                .setCustomId(`rename_ticket_modal_${selectedChannelId}`)
                .setTitle('تغيير اسم التذكرة');

            const newNameInput = new TextInputBuilder()
                .setCustomId('new_ticket_name')
                .setLabel('الاسم الجديد للتذكرة')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('اكتب الاسم الجديد هنا')
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(newNameInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
            console.log(`تم عرض مودال تغيير اسم التذكرة لـ ${interaction.user.tag}`);
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('rename_ticket_modal_')) {
            const channelId = interaction.customId.split('_')[3];
            const newName = interaction.fields.getTextInputValue('new_ticket_name');

            const ticketData = openTickets.get(channelId);
            if (!ticketData || ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه تغيير اسم التذكرة!', flags: 64 });
            }

            const channel = await interaction.guild.channels.fetch(channelId);
            await channel.setName(newName);
            ticketData.name = newName;
            openTickets.set(channelId, ticketData);

            await interaction.reply({ content: `تم تغيير اسم التذكرة إلى: ${newName}`, flags: 64 });
        }

        if (interaction.isModalSubmit() && interaction.customId === 'add_member_modal') {
            const userId = interaction.fields.getTextInputValue('user_id');
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData || ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه إضافة أعضاء إلى التذكرة!', flags: 64 });
            }

            try {
                const user = await interaction.guild.members.fetch(userId);
                await interaction.channel.permissionOverwrites.edit(userId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                });
                await interaction.reply({ content: `تم إضافة ${user} إلى التذكرة بنجاح!`, flags: 64 });
            } catch (error) {
                console.error(`خطأ في إضافة عضو: ${error.message}`);
                await interaction.reply({ content: `فشل في إضافة العضو! تأكد من أن الأيدي صحيح: ${error.message}`, flags: 64 });
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'remove_member_modal') {
            const userId = interaction.fields.getTextInputValue('user_id');
            const ticketData = openTickets.get(interaction.channel.id);
            if (!ticketData || ticketData.claimedBy !== interaction.user.id) {
                return interaction.reply({ content: 'فقط المستلم يمكنه حذف أعضاء من التذكرة!', flags: 64 });
            }

            try {
                const user = await interaction.guild.members.fetch(userId);
                await interaction.channel.permissionOverwrites.delete(userId);
                await interaction.reply({ content: `تم حذف ${user} من التذكرة بنجاح!`, flags: 64 });
            } catch (error) {
                console.error(`خطأ في حذف عضو: ${error.message}`);
                await interaction.reply({ content: `فشل في حذف العضو! تأكد من أن الأيدي صحيح: ${error.message}`, flags: 64 });
            }
        }
    } catch (error) {
        console.error(`خطأ في معالجة التفاعل: ${error.message}\nStack: ${error.stack}`);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `حدث خطأ أثناء معالجة طلبك: ${error.message}`, flags: 64 }).catch(err => console.error(`فشل في إرسال followUp: ${err.message}`));
        } else {
            await interaction.reply({ content: `حدث خطأ أثناء معالجة طلبك: ${error.message}`, flags: 64 }).catch(err => console.error(`فشل في إرسال reply: ${err.message}`));
        }
    }
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>لوحة تحكم البوت</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #2f3136; color: #dcddde; margin: 0; padding: 20px; direction: rtl; }
                h1 { text-align: center; }
                form { max-width: 800px; margin: 0 auto; background-color: #36393f; padding: 20px; border-radius: 8px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input, textarea, select { width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #202225; border-radius: 4px; background-color: #40444b; color: #dcddde; }
                button { background-color: #5865f2; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
                button:hover { background-color: #4752c4; }
                .ticket-type { border: 1px solid #202225; padding: 10px; margin-bottom: 15px; border-radius: 4px; }
                .remove-btn { background-color: #da373c; margin-left: 10px; }
                .remove-btn:hover { background-color: #a7282a; }
            </style>
        </head>
        <body>
            <h1>لوحة تحكم البوت</h1>
            <form action="/update" method="POST">
                <label for="TOKEN">توكن البوت:</label>
                <input type="text" id="TOKEN" name="TOKEN" value="${settings.TOKEN}" required>

                <label for="STAFF_ROLE_ID">أيدي رول الدعم الفني:</label>
                <input type="text" id="STAFF_ROLE_ID" name="STAFF_ROLE_ID" value="${settings.STAFF_ROLE_ID}" required>

                <label for="HIGHER_ROLE_ID">أيدي رول الإدارة العليا:</label>
                <input type="text" id="HIGHER_ROLE_ID" name="HIGHER_ROLE_ID" value="${settings.HIGHER_ROLE_ID}" required>

                <label for="TRANSCRIPT_CHANNEL_ID">أيدي قناة الترانسكربت:</label>
                <input type="text" id="TRANSCRIPT_CHANNEL_ID" name="TRANSCRIPT_CHANNEL_ID" value="${settings.TRANSCRIPT_CHANNEL_ID || ''}">

                <label for="ENABLE_TRANSCRIPT">تفعيل الترانسكربت:</label>
                <input type="checkbox" id="ENABLE_TRANSCRIPT" name="ENABLE_TRANSCRIPT" ${settings.ENABLE_TRANSCRIPT ? 'checked' : ''}>

                <label for="IMAGE_URL">رابط صورة البنل:</label>
                <input type="text" id="IMAGE_URL" name="IMAGE_URL" value="${settings.IMAGE_URL}">

                <label for="THUMBNAIL_URL">رابط صورة الثمبنيل:</label>
                <input type="text" id="THUMBNAIL_URL" name="THUMBNAIL_URL" value="${settings.THUMBNAIL_URL}">

                <label for="TICKET_IMAGE_URL">رابط صورة التذكرة:</label>
                <input type="text" id="TICKET_IMAGE_URL" name="TICKET_IMAGE_URL" value="${settings.TICKET_IMAGE_URL}">

                <label for="USE_BUTTONS">استخدام الأزرار:</label>
                <input type="checkbox" id="USE_BUTTONS" name="USE_BUTTONS" ${settings.USE_BUTTONS ? 'checked' : ''}>

                <label for="PANEL_TITLE">عنوان البنل:</label>
                <input type="text" id="PANEL_TITLE" name="PANEL_TITLE" value="${settings.PANEL_TITLE}" required>

                <label for="PANEL_DESCRIPTION">وصف البنل:</label>
                <textarea id="PANEL_DESCRIPTION" name="PANEL_DESCRIPTION" rows="4" required>${settings.PANEL_DESCRIPTION}</textarea>

                <label for="PANEL_COLOR">لون البنل (Hex):</label>
                <input type="text" id="PANEL_COLOR" name="PANEL_COLOR" value="${settings.PANEL_COLOR}" required>

                <label for="TICKET_MESSAGE">رسالة التذكرة:</label>
                <textarea id="TICKET_MESSAGE" name="TICKET_MESSAGE" rows="6" required>${settings.TICKET_MESSAGE}</textarea>

                <h3>إعدادات الـ Embed عند استلام التذكرة</h3>
                <label for="CLAIM_EMBED_TITLE">عنوان الـ Embed عند الاستلام:</label>
                <input type="text" id="CLAIM_EMBED_TITLE" name="CLAIM_EMBED_TITLE" value="${settings.CLAIM_EMBED_TITLE}" required>

                <label for="CLAIM_EMBED_DESCRIPTION">وصف الـ Embed عند الاستلام (استخدم {claimer} للمستلم و {owner} لصاحب التذكرة):</label>
                <textarea id="CLAIM_EMBED_DESCRIPTION" name="CLAIM_EMBED_DESCRIPTION" rows="4" required>${settings.CLAIM_EMBED_DESCRIPTION}</textarea>

                <label for="CLAIM_EMBED_COLOR">لون الـ Embed (Hex):</label>
                <input type="text" id="CLAIM_EMBED_COLOR" name="CLAIM_EMBED_COLOR" value="${settings.CLAIM_EMBED_COLOR}" required>

                <label for="CLAIM_EMBED_FOOTER">نص الفوتر (استخدم {date} للتاريخ):</label>
                <input type="text" id="CLAIM_EMBED_FOOTER" name="CLAIM_EMBED_FOOTER" value="${settings.CLAIM_EMBED_FOOTER}" required>

                <label for="CLAIM_EMBED_FOOTER_ICON">رابط أيقونة الفوتر (اختياري):</label>
                <input type="text" id="CLAIM_EMBED_FOOTER_ICON" name="CLAIM_EMBED_FOOTER_ICON" value="${settings.CLAIM_EMBED_FOOTER_ICON || ''}">

                <h3>إعدادات الـ Embed عند طلب الاستلام</h3>
                <label for="REQUEST_EMBED_TITLE">عنوان الـ Embed عند طلب الاستلام:</label>
                <input type="text" id="REQUEST_EMBED_TITLE" name="REQUEST_EMBED_TITLE" value="${settings.REQUEST_EMBED_TITLE}" required>

                <label for="REQUEST_EMBED_DESCRIPTION">وصف الـ Embed عند طلب الاستلام (استخدم {requester} للطالب و {claimer} للمستلم):</label>
                <textarea id="REQUEST_EMBED_DESCRIPTION" name="REQUEST_EMBED_DESCRIPTION" rows="4" required>${settings.REQUEST_EMBED_DESCRIPTION}</textarea>

                <label for="REQUEST_EMBED_COLOR">لون الـ Embed (Hex):</label>
                <input type="text" id="REQUEST_EMBED_COLOR" name="REQUEST_EMBED_COLOR" value="${settings.REQUEST_EMBED_COLOR}" required>

                <label for="REQUEST_EMBED_FOOTER">نص الفوتر (استخدم {date} للتاريخ):</label>
                <input type="text" id="REQUEST_EMBED_FOOTER" name="REQUEST_EMBED_FOOTER" value="${settings.REQUEST_EMBED_FOOTER}" required>

                <h3>أنواع التذاكر</h3>
                <div id="ticket-types">
                    ${settings.TICKET_TYPES.map((type, index) => `
                        <div class="ticket-type" id="ticket-type-${index}">
                            <label>اسم النوع ${index + 1}:</label>
                            <input type="text" name="TICKET_TYPES[${index}][label]" value="${type.label}" required>
                            <label>الإيموجي:</label>
                            <input type="text" name="TICKET_TYPES[${index}][emoji]" value="${type.emoji}" required>
                            <label>الوصف:</label>
                            <input type="text" name="TICKET_TYPES[${index}][description]" value="${type.description}" required>
                            <label>القيمة (value):</label>
                            <input type="text" name="TICKET_TYPES[${index}][value]" value="${type.value}" required>
                            <label>البادئة (prefix):</label>
                            <input type="text" name="TICKET_TYPES[${index}][prefix]" value="${type.prefix}" required>
                            <label>أيدي الكاتيغوري:</label>
                            <input type="text" name="TICKET_TYPES[${index}][category]" value="${type.category}">
                            <button type="button" class="remove-btn" onclick="removeTicketType(${index})">حذف</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" onclick="addTicketType()">إضافة نوع تذكرة جديد</button>

                <button type="submit">حفظ التغييرات</button>
            </form>

            <script>
                let ticketTypeCount = ${settings.TICKET_TYPES.length};

                function addTicketType() {
                    const ticketTypesDiv = document.getElementById('ticket-types');
                    const newTicketTypeDiv = document.createElement('div');
                    newTicketTypeDiv.className = 'ticket-type';
                    newTicketTypeDiv.id = \`ticket-type-\${ticketTypeCount}\`;
                    newTicketTypeDiv.innerHTML = \`
                        <label>اسم النوع \${ticketTypeCount + 1}:</label>
                        <input type="text" name="TICKET_TYPES[\${ticketTypeCount}][label]" required>
                        <label>الإيموجي:</label>
                        <input type="text" name="TICKET_TYPES[\${ticketTypeCount}][emoji]" required>
                        <label>الوصف:</label>
                        <input type="text" name="TICKET_TYPES[\${ticketTypeCount}][description]" required>
                        <label>القيمة (value):</label>
                        <input type="text" name="TICKET_TYPES[\${ticketTypeCount}][value]" required>
                        <label>البادئة (prefix):</label>
                        <input type="text" name="TICKET_TYPES[\${ticketTypeCount}][prefix]" required>
                        <label>أيدي الكاتيغوري:</label>
                        <input type="text" name="TICKET_TYPES[\${ticketTypeCount}][category]">
                        <button type="button" class="remove-btn" onclick="removeTicketType(\${ticketTypeCount})">حذف</button>
                    \`;
                    ticketTypesDiv.appendChild(newTicketTypeDiv);
                    ticketTypeCount++;
                }

                function removeTicketType(index) {
                    const ticketTypeDiv = document.getElementById(\`ticket-type-\${index}\`);
                    if (ticketTypeDiv) {
                        ticketTypeDiv.remove();
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.post('/update', (req, res) => {
    const newTicketTypes = [];
    for (let i = 0; req.body.TICKET_TYPES && i < req.body.TICKET_TYPES.length; i++) {
        newTicketTypes.push({
            label: req.body.TICKET_TYPES[i].label,
            emoji: req.body.TICKET_TYPES[i].emoji,
            description: req.body.TICKET_TYPES[i].description,
            value: req.body.TICKET_TYPES[i].value,
            prefix: req.body.TICKET_TYPES[i].prefix,
            category: req.body.TICKET_TYPES[i].category
        });
    }

    const cleanedTicketMessage = req.body.TICKET_MESSAGE
        .trim()
        .replace(/^[^・\n]+/, '')
        .trim();

    settings = {
        TOKEN: req.body.TOKEN,
        CLIENT_ID: settings.CLIENT_ID,
        STAFF_ROLE_ID: req.body.STAFF_ROLE_ID,
        HIGHER_ROLE_ID: req.body.HIGHER_ROLE_ID,
        TRANSCRIPT_CHANNEL_ID: req.body.TRANSCRIPT_CHANNEL_ID || '',
        ENABLE_TRANSCRIPT: req.body.ENABLE_TRANSCRIPT === 'on',
        IMAGE_URL: req.body.IMAGE_URL,
        THUMBNAIL_URL: req.body.THUMBNAIL_URL,
        TICKET_IMAGE_URL: req.body.TICKET_IMAGE_URL,
        USE_BUTTONS: req.body.USE_BUTTONS === 'on',
        PANEL_TITLE: req.body.PANEL_TITLE,
        PANEL_DESCRIPTION: req.body.PANEL_DESCRIPTION,
        PANEL_COLOR: req.body.PANEL_COLOR,
        TICKET_MESSAGE: cleanedTicketMessage,
        TICKET_TYPES: newTicketTypes,
        CLAIM_EMBED_TITLE: req.body.CLAIM_EMBED_TITLE,
        CLAIM_EMBED_DESCRIPTION: req.body.CLAIM_EMBED_DESCRIPTION,
        CLAIM_EMBED_COLOR: req.body.CLAIM_EMBED_COLOR,
        CLAIM_EMBED_FOOTER: req.body.CLAIM_EMBED_FOOTER,
        CLAIM_EMBED_FOOTER_ICON: req.body.CLAIM_EMBED_FOOTER_ICON,
        REQUEST_EMBED_TITLE: req.body.REQUEST_EMBED_TITLE,
        REQUEST_EMBED_DESCRIPTION: req.body.REQUEST_EMBED_DESCRIPTION,
        REQUEST_EMBED_COLOR: req.body.REQUEST_EMBED_COLOR,
        REQUEST_EMBED_FOOTER: req.body.REQUEST_EMBED_FOOTER
    };
    fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
    res.redirect('/');
    client.destroy();
    client.login(settings.TOKEN).catch(err => console.error(`فشل تسجيل الدخول: ${err.message}`));
});

app.listen(30014, () => {
    console.log('الداشبورد يعمل على http://localhost:30014');
});

client.login(settings.TOKEN).catch(err => console.error(`فشل تسجيل الدخول: ${err.message}`));