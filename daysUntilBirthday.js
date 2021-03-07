// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: birthday-cake;

// --------------------------------
//       UPCOMING BIRTHDAYS
// --------------------------------
//
// # HOW TO USE
// ## MODE 1 (DEFAULT): ONLY CHOSEN CONTACTS:
// - In your contacts app, edit the contacts you want to be visible in this widget.
// - You need to set up an additional 'date' field in your contact and give the date the label 'daysUntilBirthday' (change the 'contactNotesKeyWord' if desired).
// - Run the script initially in the Scriptable app to create a .json file in iCloud containing contact information for faster access.
// - When you add new contacts via the label, run the script again in the app to update the .json and make the changes visible in iCloud-mode.
// - When setting the script up as Widget, use the smallest presentation mode and provide the parameter 'iCloud' (without the '').
//
// The name of the label you need to set in contacts on the first date field:
const contactNotesKeyWord = 'daysUntilBirthday';
//
// ## MODE 2: SHOW ALL CONTACTS WITH A BIRTHDAY CONFIGURED:
// - Set the next variable to 'true' or provide the parameter 'showAll' in widget mode to show all contacts that have a birthday in the regular birthday field configured.
let showAllContacts = true;
//
// ## iCloud MODE:
// - Set the next variable to 'true' or provide the parameter 'iCloud' in widget mode to never recalculate which contacts are shown again.
// - If false -> everytime the contacts are scanned.
// - If true -> contacts are not scanned and last used contacts are used again.
let useIcloud = false;
//
// --------------------------------

///////////////////////////////////
//            SETTINGS            
///////////////////////////////////
//
// EDIT THESE ACCORDING TO YOUR LANGUAGE
const daysUntilBirthdayText = 'UPCOMING BIRTHDAYS';
const daysText = 'Days';
const todayText = 'Today';
//
// DATE FORMAT
birthdayDateFormat = 1; // 1 = DAYS UNTIL, 2 = DATE ONLY, 3 = DAYS UNTIL + DATE
const dateFormatter = new DateFormatter();
dateFormatter.dateFormat = 'dd-MM-yyyy';
const timeFormatter = new DateFormatter();
timeFormatter.dateFormat = 'dd-MM-yyyy HH:mm:ss';
//
// HEADER FORMAT
const headerFont = new Font('Menlo-bold', 11);
const headerColor = new Color("#FFC414");
//
// CONTACT NAME FORMAT
const contactNameFont = new Font('Menlo-bold', 11);
const contactNameColor = new Color("#FFFFFF");
//
// CONTACT BIRTHDAY FORMAT
const birthdayDateFont = new Font('Menlo-regular', 11);
const birthdayDateColor = new Color("#FFFFFF");
const birthdayTodayColor = new Color("#FFC414");
//
// UPDATED INFO FORMAT
const updatedAtFont = new Font('Menlo-boldItalic', 6);
const updatedAtColor = new Color("#918A8A");
//
// BACKGROUND COLOUR
const backgroundColor = new Color("#222222");
//
// NUMBER OF CONTACTS TO DISPLAY
const contactsToShow = 7;
//
// NUMBER OF LINE SPACES
const contactLineSpace = 3;
//
// USED FOR INSERTING SPACE CHARACTERS
const lineLength = 9;
//
///////////////////////////////////

// class that is also serialised to a .json file in iCloud
class CustomContact {
    constructor(name, daysUntil, date) {
        this.name = name;
        this.daysUntil = daysUntil;
        this.date = date;
    }

    getAsKey() {
        // name and daysUntil together make the contact unique
        return this.name + '-' + this.daysUntil;
    }
}

const widget = await createWidget();
widget.backgroundColor = backgroundColor;
if (!config.runsInWidget) {
    await widget.presentSmall();
}

Script.setWidget(widget);
Script.complete();

async function createWidget() {
    // overwrite the default values on top when running as widget
    // working parameter examples: 'iCloud,showAll', 'showAll,iCloud', 'iCloud', 'showAll'
    if (args.widgetParameter) {
        if (args.widgetParameter.includes('iCloud')) {
            useIcloud = true;
        }
        if (args.widgetParameter.includes('showAll')) {
            showAllContacts = true;
        }
    }

    const widget = new ListWidget();
    let headerRow = widget.addStack();
    let headerText = headerRow.addText(daysUntilBirthdayText);
    headerText.textColor = headerColor;
    headerText.font = headerFont;
    widget.addSpacer(contactLineSpace);

    let shownCustomContacts = [];
    let dataSource = '';

    // enter 'iCloud' without the '' as parameter when setting up the script as a widget
    if (useIcloud) {
        dataSource = 'iCloud';
        shownCustomContacts = loadCustomContacts();
        updateCustomContacts(shownCustomContacts);
    } else {
        dataSource = 'iPhone';

        let containers = await ContactsContainer.all();
        let contactsInIos = await Contact.all(containers);

        let keysForDuplicatePrevention = [];
        for (let contact of contactsInIos) {
            let dateToUse = null; // if set, a contact is found
            if (showAllContacts) {
                // MODE 2: SHOW ALL CONTACTS WITH A BIRTHDAY CONFIGURED
                if (contact.isBirthdayAvailable) {
                    dateToUse = contact.birthday;
                    dateToUse = getFixedDate(dateToUse);
                }
            } else {
                // MODE 1: ONLY CHOSEN CONTACTS
                // contacts need to have an additional date property named like the content of variable contactNotesKeyWord
                if (contact.dates) {
                    for (let date of contact.dates) {
                        if (date.label.startsWith(contactNotesKeyWord)) {
                            dateToUse = date.value;
                            dateToUse = getFixedDate(dateToUse);
                        }
                    }
                }
            }

            if (!dateToUse) {
                // contact should not be shown -> continue to the next contact
                continue;
            }

            // if here: contact will be shown
            // the shorter nickname is preferred
            let contactsName = contact.nickname ? contact.nickname : contact.givenName;
            // next line removes emoji that come after a space character
            contactsName = contactsName.split(' ')[0];
            let foundContact = new CustomContact(contactsName, calculateDaysUntil(dateToUse), dateFormatter.string(new Date(dateToUse)));

            // check if already found before (in case of multiple contact containers)
            if (!keysForDuplicatePrevention.includes(foundContact.getAsKey())) {
                keysForDuplicatePrevention.push(foundContact.getAsKey());
                shownCustomContacts.push(foundContact);
            }
        }
    }

    // sorts contacts by how near their birthday is
    shownCustomContacts.sort(function(a, b) {
        return a.daysUntil > b.daysUntil;
    });

    // write back to .json in iCloud
    saveCustomContacts(shownCustomContacts);

    // this row consists of two customContact infos
    let currentRow;

    // counter for creating two columns and a maximum of 20 visible contacts
    let contactCounter = 0;
    for (let customContact of shownCustomContacts) {
        if (contactCounter === contactsToShow) {
            // only the top x earliest birthdays are shown in the widget
            break;
        }
        if (contactCounter % 1 === 0) {
            // start a new row
            currentRow = widget.addStack();
        }
        addContactInfoToRow(customContact, currentRow);
        contactCounter++;
        if (contactCounter < 20) {
            widget.addSpacer(contactLineSpace);
        }
    }

    let updatedAt = widget.addText(dataSource + ', ' + timeFormatter.string(new Date()));
    updatedAt.font = updatedAtFont;
    updatedAt.textColor = updatedAtColor;
    updatedAt.centerAlignText();
    return widget;
}

// used to align the information
function addSpaces(amount, row) {
    for (let i = 0; i < amount; i++) {
        let text = row.addText(' ');
        text.font = contactNameFont;
    }
}

// adds the contact date info
function addContactInfoToRow(customContact, row) {
    addSpaces(lineLength - customContact.name.length, row);
    let nameRow = row.addText(customContact.name);
    nameRow.font = contactNameFont;
    nameRow.textColor = contactNameColor;
    let actualFullBirthday = customContact.daysUntil === 0 ? ' ' + todayText + '\n ' + customContact.date.replace('.2222', '.????') : ' ' + customContact.daysUntil + ' ' + daysText + '\n ' + customContact.date.replace('.2222', '.????');
    let actualBirthdayDate = ' ' + customContact.date.replace('.2222', '.????');
    let actualBirthdayDaysUntil = customContact.daysUntil === 0 ? ' ' + todayText : ' ' + customContact.daysUntil + ' ' + daysText;
    if (birthdayDateFormat == 1) {
        actualDate = actualBirthdayDaysUntil;
    } else if (birthdayDateFormat == 2) {
        actualDate = actualBirthdayDate;
    } else if (birthdayDateFormat == 3) {
        actualDate = actualFullBirthday;
    }
    let daysInfoText = row.addText(actualDate);
    daysInfoText.font = birthdayDateFont;
    if (actualBirthdayDaysUntil.includes(todayText)) {
        daysInfoText.textColor = birthdayTodayColor;
    } else {
        daysInfoText.textColor = birthdayDateColor;
    }
}

function calculateDaysUntil(birthdayString) {
    let startDate = new Date();
    let targetDate = new Date(birthdayString);
    targetDate.setFullYear(startDate.getFullYear());

    let timeRemaining = parseInt((targetDate.getTime() - startDate.getTime()) / 1000);

    if (timeRemaining < 0) {
        // the date was in the past -> recalculate for next year
        targetDate.setFullYear(targetDate.getFullYear() + 1);
        timeRemaining = parseInt((targetDate.getTime() - startDate.getTime()) / 1000);
    }

    if (timeRemaining >= 0) {
        let days = 1 + parseInt(timeRemaining / 86400);
        return parseInt(days, 10) % 365;
    } else {
        return '???';
    }
}

// recalculates the daysUntil value of the customContacts
function updateCustomContacts(customContacts) {
    for (let contact of customContacts) {
        let date = dateFormatter.date(contact.date);
        date = getFixedDate(date);
        contact.daysUntil = calculateDaysUntil(date.toString());
    }
}

// loads contacts stored in the .json
function loadCustomContacts() {
    // this could be changed to FileManager.local() if you don't want to use iCloud
    let fm = FileManager.iCloud();
    let path = getFilePath();
    if (fm.fileExists(path)) {
        let raw = fm.readString(path);
        return JSON.parse(raw);
    } else {
        return [];
    }
}

// saves the CustomContacts to a file in iCloud Drive
function saveCustomContacts(customContacts) {
    // this could be changed to FileManager.local() if you don't want to use iCloud
    let fm = FileManager.iCloud();
    let path = getFilePath();
    let raw = JSON.stringify(customContacts);
    fm.writeString(path, raw);
}

// gets path of the file containing the stored CustomContact  data. Creates the file if necessary
function getFilePath() {
    let fm = FileManager.iCloud();
    let dirPath = fm.joinPath(fm.documentsDirectory(), "daysUntilBirthdayData");
    if (!fm.fileExists(dirPath)) {
        fm.createDirectory(dirPath);
    }
    return fm.joinPath(dirPath, "customContacts.json");
}

// fixes bug in iOS contacts if no year is set
function getFixedDate(date) {
    if (date?.getFullYear() === 1) {
        date = new Date(2222, date.getMonth(), date.getDate());
        date.setDate(date.getDate() + 2);
    }
    return date;
}