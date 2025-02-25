// content.js - Content Script
// This script will be injected into web pages, but we don't need additional functionality
// for this extension since we're using chrome.scripting.executeScript for form filling
console.log("DJ Booking Form Autofiller extension loaded");

function fillForm(data) {
    console.log("Starting to fill form with data:", data);
    try {
      // Map of field labels to their corresponding input selectors
      const fieldMap = {
        "Account point of contact:": "input[aria-label='Account point of contact:']",
        "Account contact email": "input[aria-label='Account contact email']",
        "Event date": ".ant-picker-input input[aria-label='Event date']",
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
              valueToUse = data.accountEmail || "";
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
      
      // Select "Schools & Universities" in the Event type dropdown
      selectDropdownOption("Event type", "Schools & Universities");
      
      console.log("Form filling complete");
      return {success: true, message: "Form filled successfully"};
    } catch (error) {
      console.error("Error filling form:", error);
      return {success: false, message: error.message};
    }
    
    // Helper function to find and select a radio button by label text
    function selectRadioButtonByLabel(labelText, value) {
      try {
        console.log(`Selecting radio button for "${labelText}" with value "${value}"`);
        
        // Find the label containing the specified text
        const labels = Array.from(document.querySelectorAll('.ql-editor p')).filter(
          el => el.textContent.includes(labelText)
        );
        
        if (labels.length === 0) {
          console.warn(`Could not find label for "${labelText}"`);
          return false;
        }
        
        // Find the widget container that contains this label
        let widgetContainer = labels[0].closest('.fillout-field-multiple-choice');
        if (!widgetContainer) {
          console.warn(`Could not find widget container for "${labelText}"`);
          return false;
        }
        
        // Find the radio options in this container
        const radioOptions = widgetContainer.querySelectorAll('[role="radio"]');
        
        for (const radio of radioOptions) {
          // Find the label div inside the radio button
          const radioLabel = radio.querySelector('div[id$="-label"]');
          if (radioLabel && radioLabel.textContent === value) {
            console.log(`Found matching radio button with label "${value}"`);
            // Click the radio button
            radio.click();
            return true;
          }
        }
        
        console.warn(`Could not find radio button with value "${value}" for "${labelText}"`);
        return false;
      } catch (error) {
        console.error(`Error selecting radio for "${labelText}":`, error);
        return false;
      }
    }
    
    // Helper function to select an option from a dropdown
    function selectDropdownOption(labelText, optionText) {
      try {
        console.log(`Selecting dropdown option "${optionText}" for "${labelText}"`);
        
        // Find the label containing the specified text
        const labels = Array.from(document.querySelectorAll('.ql-editor p')).filter(
          el => el.textContent.includes(labelText)
        );
        
        if (labels.length === 0) {
          console.warn(`Could not find label for "${labelText}"`);
          return false;
        }
        
        // Find the widget container that contains this label
        let widgetContainer = labels[0].closest('.fillout-field-dropdown');
        if (!widgetContainer) {
          console.warn(`Could not find widget container for "${labelText}"`);
          return false;
        }
        
        // Find the dropdown element
        const dropdown = widgetContainer.querySelector('.css-a7nr73-control');
        if (!dropdown) {
          console.warn(`Could not find dropdown control for "${labelText}"`);
          return false;
        }
        
        // Click the dropdown to open it
        dropdown.click();
        
        // Give some time for the dropdown to open
        setTimeout(() => {
          // Find the option with the specified text
          const options = document.querySelectorAll('[id^="react-select-"][id$="-option"]');
          for (const option of options) {
            if (option.textContent === optionText) {
              // Click the option
              option.click();
              return true;
            }
          }
          
          console.warn(`Could not find option "${optionText}" for dropdown "${labelText}"`);
          return false;
        }, 300);
        
        return true;
      } catch (error) {
        console.error(`Error selecting dropdown for "${labelText}":`, error);
        return false;
      }
    }
  }