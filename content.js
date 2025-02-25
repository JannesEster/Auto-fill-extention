// content.js - Content Script
// This script will be injected into web pages
console.log("DJ Booking Form Autofiller extension loaded");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "fillForm") {
    const result = fillForm(request.data);
    sendResponse(result);
    return true; // Indicates we'll respond asynchronously
  }
});

// Main form filling function
function fillForm(data) {
  console.log("Starting to fill form with data:", data);
  try {
    // Map of field labels to their corresponding input selectors
    const fieldMap = {
      "Account point of contact:": "input[aria-label='Account point of contact:']",
      "Account contact email": "input[aria-label='Account contact email']",
      "Event date": ".ant-picker-input input",
      "School/company:": "input[aria-label='School/company:']",
      "Bride/person name": "input[aria-label='Bride/person name']",
      "Customer best contact email": "input[aria-label='Customer best contact email']",
      "Customer contact phone": "input[aria-label='Customer contact phone']",
      "Venue (room)": "input[aria-label='Venue (room)']",
      "Start time": "input[aria-label='Start time']",
      "Finish time": "input[aria-label='Finish time']",
      "DJ Total hours": "input[aria-label='DJ Total hours']"
    };
    
    // Fill in text fields
    for (const [label, selector] of Object.entries(fieldMap)) {
      if (selector && document.querySelector(selector)) {
        const inputField = document.querySelector(selector);
        let valueToUse = "";
        
        // Map the label to the corresponding data property
        switch(label) {
          case "Account point of contact:":
            valueToUse = "May"; // Default value
            break;
          case "Account contact email":
            valueToUse = data.accountEmail || "may.myat@panpacific.com";
            break;
          case "Event date":
            valueToUse = data.eventDate || "";
            if (valueToUse) {
              // For date picker, we need special handling
              const dateField = document.querySelector(selector);
              if (dateField) {
                dateField.click(); // Open the date picker
                setTimeout(() => {
                  // Type the date manually
                  dateField.value = valueToUse;
                  dateField.dispatchEvent(new Event('input', { bubbles: true }));
                  dateField.dispatchEvent(new Event('change', { bubbles: true }));
                  // Close the date picker by clicking elsewhere
                  document.body.click();
                }, 200);
              }
              continue; // Skip the regular setting for date fields
            }
            break;
          case "School/company:":
            valueToUse = data.schoolCompany || "";
            break;
          case "Bride/person name":
            valueToUse = data.brideName || "";
            break;
          case "Customer best contact email":
            valueToUse = data.contactEmail || "";
            break;
          case "Customer contact phone":
            valueToUse = data.contactPhone || "";
            break;
          case "Venue (room)":
            valueToUse = data.venue || "";
            break;
          case "Start time":
            valueToUse = data.startTime || "";
            break;
          case "Finish time":
            valueToUse = data.finishTime || "";
            break;
          case "DJ Total hours":
            valueToUse = data.totalHours || "";
            break;
          default:
            valueToUse = "";
        }
        
        console.log(`Setting ${label} to ${valueToUse}`);
        inputField.value = valueToUse;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.warn(`Could not find field for "${label}" using selector: ${selector}`);
      }
    }
    
    // Handle radio buttons
    
    // Is it a SATURDAY booking?
    const saturdayValue = data.isSaturday ? "Yes" : "No";
    selectRadioButtonByLabel("Is it a SATURDAY booking?", saturdayValue);
    
    // Create customer contact
    selectRadioButtonByLabel("Create customer contact", "Y");
    
    // Order contains DJ package?
    selectRadioButtonByLabel("Order contains DJ package?", "Y");
    
    // Handle Event type dropdown (Schools & Universities)
    handleEventTypeDropdown();
    
    console.log("Form filling complete");
    return {success: true, message: "Form filled successfully"};
  } catch (error) {
    console.error("Error filling form:", error);
    return {success: false, message: error.message};
  }
};

// Helper function to handle the Event type dropdown specifically
function handleEventTypeDropdown() {
  try {
    // Find the dropdown container
    const eventTypeContainer = document.querySelector('[id$="-4wTYDRt1ziqB32tazfqMCx-label"]');
    if (!eventTypeContainer) {
      console.warn("Could not find Event type dropdown container");
      return false;
    }
    
    // Navigate to the dropdown parent container
    const dropdownContainer = eventTypeContainer.closest('.fillout-field-dropdown');
    if (!dropdownContainer) {
      console.warn("Could not find dropdown widget container");
      return false;
    }
    
    // Find the React Select control
    const dropdown = dropdownContainer.querySelector('.css-a7nr73-control');
    if (!dropdown) {
      console.warn("Could not find dropdown control");
      return false;
    }
    
    // Check if it's already set to "Schools & Universities"
    const currentValue = dropdown.querySelector('.css-phmn51-singleValue');
    if (currentValue && currentValue.textContent === "Schools & Universities") {
      console.log("Event type already set to Schools & Universities");
      return true;
    }
    
    // Click the dropdown to open it
    dropdown.click();
    console.log("Clicked dropdown to open options");
    
    // Look for Schools & Universities option after a short delay
    setTimeout(() => {
      const options = Array.from(document.querySelectorAll('[id^="react-select-"][id$="-option"]'));
      console.log(`Found ${options.length} dropdown options`);
      
      for (const option of options) {
        if (option.textContent === "Schools & Universities") {
          option.click();
          console.log("Selected Schools & Universities option");
          return true;
        }
      }
      
      console.warn("Could not find Schools & Universities option");
      return false;
    }, 500);
    
    return true;
  } catch (error) {
    console.error("Error handling event type dropdown:", error);
    return false;
  }
}

// Helper function to find and select a radio button by label text
function selectRadioButtonByLabel(labelText, value) {
  try {
    console.log(`Selecting radio button for "${labelText}" with value "${value}"`);
    
    // Find labels containing the specified text
    const labelElements = Array.from(document.querySelectorAll('.ql-editor p')).filter(
      el => el.textContent.includes(labelText)
    );
    
    if (labelElements.length === 0) {
      console.warn(`Could not find label for "${labelText}"`);
      return false;
    }
    
    // Find the widget container
    let widgetContainer = null;
    for (const labelEl of labelElements) {
      const container = labelEl.closest('.fillout-field-multiple-choice');
      if (container) {
        widgetContainer = container;
        break;
      }
    }
    
    if (!widgetContainer) {
      console.warn(`Could not find widget container for "${labelText}"`);
      return false;
    }
    
    // Find all radio options in this container
    const radioOptions = widgetContainer.querySelectorAll('[role="radio"]');
    console.log(`Found ${radioOptions.length} radio options for "${labelText}"`);
    
    // Try to find the option with the specified value
    for (const radio of radioOptions) {
      // Look for a label with the exact value
      const radioLabelEl = radio.querySelector(`div[id$="-label"]`);
      
      if (radioLabelEl && radioLabelEl.textContent === value) {
        radio.click();
        console.log(`Selected radio option "${value}" for "${labelText}"`);
        return true;
      }
    }
    
    console.warn(`Could not find radio option "${value}" for "${labelText}"`);
    return false;
  } catch (error) {
    console.error(`Error selecting radio for "${labelText}":`, error);
    return false;
  }
}