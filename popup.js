document.addEventListener('DOMContentLoaded', function() {
    const emailContentTextarea = document.getElementById('emailContent');
      const extractButton = document.getElementById('extractButton');
      const fillFormButton = document.getElementById('fillFormButton');
      const statusDiv = document.getElementById('status');
      const extractedDataDiv = document.getElementById('extractedData');
      
      let extractedData = null;
      
      extractButton.addEventListener('click', function() {
        const emailContent = emailContentTextarea.value.trim();
        
        if (!emailContent) {
          showStatus('Please paste the email content first.', 'error');
          return;
        }
        
        try {
          extractedData = parseEmailContent(emailContent);
          
          // Display extracted data for review
          extractedDataDiv.innerHTML = '<h3>Extracted Data:</h3>';
          extractedDataDiv.innerHTML += '<pre>' + JSON.stringify(extractedData, null, 2) + '</pre>';
          extractedDataDiv.style.display = 'block';
          
          fillFormButton.disabled = false;
          showStatus('Data extracted successfully. Click "Fill Form" to autofill the booking form.', 'success');
        } catch (error) {
          showStatus('Error extracting data: ' + error.message, 'error');
          fillFormButton.disabled = true;
        }
      });
      
      fillFormButton.addEventListener('click', function() {
        if (!extractedData) {
          showStatus('Please extract data first.', 'error');
          return;
        }
        
        showStatus('Filling form...', 'success');
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: fillForm,
            args: [extractedData]
          }, function(results) {
            if (chrome.runtime.lastError) {
              showStatus('Error filling form: ' + chrome.runtime.lastError.message, 'error');
            } else {
              if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.success) {
                  showStatus('Form filled successfully!', 'success');
                } else {
                  showStatus('Form filling completed with issues: ' + result.message, 'error');
                }
              } else {
                showStatus('Form filling completed, but with unknown status.', 'success');
              }
            }
          });
        });
      });
      
      function parseEmailContent(content) {
        const data = {};
        
        console.log("Parsing email content:", content);
        
        // Extract package info
        const packageMatch = content.match(/Package:\s*(.*?)(?:\n|$)/i);
        data.hasDjPackage = packageMatch && packageMatch[1].toLowerCase().includes('dj');
        
        // Extract date
        const dateMatch = content.match(/Date:\s*(.*?)(?:\n|$)/i);
        if (dateMatch && dateMatch[1].trim()) {
          // Convert date to format expected by the form (DD/MMM/YY)
          data.eventDate = formatDate(dateMatch[1].trim());
          console.log("Parsed date:", dateMatch[1].trim(), "→", data.eventDate);
          
          // Check if it's a Saturday booking
          try {
            let dateStr = dateMatch[1].trim();
            // Remove ordinal suffixes (1st, 2nd, 3rd, etc.)
            dateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
            
            let eventDate;
            // Try different date formats
            if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              // Try both MM/DD/YYYY and DD/MM/YYYY formats
              eventDate = new Date(parts[2], parts[1]-1, parts[0]); // DD/MM/YYYY
              if (isNaN(eventDate.getTime())) {
                eventDate = new Date(parts[2], parts[0]-1, parts[1]); // MM/DD/YYYY
              }
            } else {
              eventDate = new Date(dateStr);
            }
            
            if (!isNaN(eventDate.getTime())) {
              data.isSaturday = eventDate.getDay() === 6; // 6 is Saturday
              console.log("Date is a Saturday:", data.isSaturday);
            } else {
              console.log("Could not determine if date is a Saturday, defaulting to false");
              data.isSaturday = false;
            }
          } catch (e) {
            console.error("Error determining if date is Saturday:", e);
            data.isSaturday = false;
          }
        }
        
        // Extract start time
        const startTimeMatch = content.match(/Start time:\s*(.*?)(?:\n|$)/i);
        if (startTimeMatch) {
          data.startTime = startTimeMatch[1].trim();
          console.log("Parsed start time:", data.startTime);
        }
        
        // Calculate finish time and total hours (assuming 4 hours is standard)
        if (data.startTime) {
          data.totalHours = 4;
          data.finishTime = calculateFinishTime(data.startTime, data.totalHours);
          console.log("Calculated finish time:", data.finishTime);
        }
        
        // Extract room/venue
        const roomMatch = content.match(/Room:\s*(.*?)(?:\n|$)/i);
        if (roomMatch) {
          data.venue = roomMatch[1].trim();
          console.log("Parsed venue:", data.venue);
        }
        
        // Extract client name (school/company)
        const clientNameMatch = content.match(/Client names?:\s*(.*?)(?:\n|$)/i);
        if (clientNameMatch) {
          data.schoolCompany = clientNameMatch[1].trim();
          data.brideName = clientNameMatch[1].trim(); // Use same value for bride/person name field
          console.log("Parsed school/company:", data.schoolCompany);
        }
        
        // Extract contact email
        const emailMatch = content.match(/Client contact email:\s*(.*?)(?:\n|$)/i);
        if (emailMatch) {
          data.contactEmail = emailMatch[1].trim();
          console.log("Parsed contact email:", data.contactEmail);
          
          // Use the same email for the account contact if nothing else specified
          data.accountEmail = data.contactEmail;
        }
        
        // Extract contact phone
        const phoneMatch = content.match(/Client contact phone:\s*(.*?)(?:\n|$)/i);
        if (phoneMatch) {
          data.contactPhone = phoneMatch[1].trim();
          console.log("Parsed contact phone:", data.contactPhone);
        }
        
        // Set default values for fields not typically in email
        data.eventType = "Schools & Universities";
        data.createCustomerContact = true;
        
        // Try to be more flexible with parsing - look for keywords if standard patterns fail
        if (!data.venue) {
          // Try to find venue/location/place keywords
          const venueKeywords = ['venue:', 'location:', 'place:', 'at:', 'in:'];
          for (const keyword of venueKeywords) {
            const match = content.match(new RegExp(keyword + '\\s*(.*?)(?:\\n|$)', 'i'));
            if (match) {
              data.venue = match[1].trim();
              console.log("Found venue using keyword:", keyword, data.venue);
              break;
            }
          }
        }
        
        return data;
      }
      
      function formatDate(dateStr) {
        try {
          // Handle various date formats
          // 1. Convert any text month formats
          dateStr = dateStr.replace(/January|Jan/i, '01');
          dateStr = dateStr.replace(/February|Feb/i, '02');
          dateStr = dateStr.replace(/March|Mar/i, '03');
          dateStr = dateStr.replace(/April|Apr/i, '04');
          dateStr = dateStr.replace(/May/i, '05');
          dateStr = dateStr.replace(/June|Jun/i, '06');
          dateStr = dateStr.replace(/July|Jul/i, '07');
          dateStr = dateStr.replace(/August|Aug/i, '08');
          dateStr = dateStr.replace(/September|Sep/i, '09');
          dateStr = dateStr.replace(/October|Oct/i, '10');
          dateStr = dateStr.replace(/November|Nov/i, '11');
          dateStr = dateStr.replace(/December|Dec/i, '12');
          
          // Remove ordinal suffixes (1st, 2nd, 3rd, etc.)
          dateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
          
          // Parse date from various formats
          let date;
          if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
            // Format: DD/MM/YYYY or MM/DD/YYYY
            const parts = dateStr.split('/');
            if (parts[0] > 12) {
              date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
            } else {
              date = new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
            }
          } else if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{2,4}$/)) {
            // Format: DD-MM-YYYY or MM-DD-YYYY
            const parts = dateStr.split('-');
            if (parts[0] > 12) {
              date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
            } else {
              date = new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
            }
          } else {
            // Try standard Date parsing
            date = new Date(dateStr);
          }
          
          if (isNaN(date.getTime())) {
            throw new Error("Invalid date");
          }
          
          // Format as DD/MMM/YY (05/Apr/25)
          const day = String(date.getDate()).padStart(2, '0');
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const month = monthNames[date.getMonth()];
          const year = String(date.getFullYear()).slice(-2);
          
          return `${day}/${month}/${year}`;
        } catch (e) {
          console.error("Date parsing error:", e);
          return dateStr; // Return original if parsing fails
        }
      }
      
      function calculateFinishTime(startTime, hours) {
        try {
          // Parse the start time
          let timeStr = startTime.toLowerCase();
          const isPM = timeStr.includes('pm');
          timeStr = timeStr.replace(/[^0-9:]/g, '');
          
          let [hours24, minutes] = [0, 0];
          
          if (timeStr.includes(':')) {
            [hours24, minutes] = timeStr.split(':').map(Number);
          } else {
            hours24 = parseInt(timeStr);
            minutes = 0;
          }
          
          // Convert to 24-hour format if PM
          if (isPM && hours24 < 12) {
            hours24 += 12;
          }
          
          // Add the duration
          hours24 += hours;
          
          // Convert back to 12-hour format
          let finishHour = hours24 % 12;
          if (finishHour === 0) finishHour = 12;
          const finishAmPm = hours24 >= 12 ? 'pm' : 'am';
          
          return `${finishHour}:${String(minutes).padStart(2, '0')}${finishAmPm}`;
        } catch (e) {
          console.error("Time calculation error:", e);
          return ""; // Return empty if calculation fails
        }
      }
      
      function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
      }
    });
    
    // This function runs in the context of the web page
    function fillForm(data) {
      console.log("Starting to fill form with data:", data);
      try {
        // First, identify all form fields on the page
        const inputs = document.querySelectorAll('input, textarea, select');
        const radioGroups = {};
        
        // Create a map of all labels and their target elements
        let labelMap = {};
        document.querySelectorAll('label').forEach(label => {
          const forId = label.getAttribute('for');
          if (forId) {
            labelMap[label.textContent.trim().toLowerCase()] = forId;
          }
        });
        
        console.log("Found " + inputs.length + " input fields on the page");
        
        // Account details
        console.log("Filling account details");
        fillField("account point of contact", "May");
        fillField("account contact email", data.accountEmail || "");
        
        // Event details
        console.log("Filling event details");
        fillField("event date", data.eventDate || "", true);
        
        // Handle select for event type
        const eventTypeSelects = Array.from(document.querySelectorAll('select')).filter(select => {
          const nearbyLabel = findNearbyLabel(select);
          return nearbyLabel && nearbyLabel.toLowerCase().includes("event type");
        });
        
        if (eventTypeSelects.length > 0) {
          const select = eventTypeSelects[0];
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].text.includes("Schools & Universities")) {
              select.selectedIndex = i;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
        
        // Saturday booking
        console.log("Setting Saturday booking");
        const saturdayBookingRadios = findRadioGroupByLabel("is it a saturday booking");
        if (saturdayBookingRadios.length > 0) {
          const valueToSelect = data.isSaturday ? "Yes" : "No";
          for (const radio of saturdayBookingRadios) {
            if ((radio.value === valueToSelect) || 
                (radio.nextSibling && radio.nextSibling.textContent.trim() === valueToSelect)) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
        
        // Create customer contact
        console.log("Setting customer contact");
        selectRadioOption("create customer contact", data.createCustomerContact ? "Y" : "N");
        
        // DJ package
        console.log("Setting DJ package");
        selectRadioOption("order contains dj package", data.hasDjPackage ? "Y" : "N");
        
        // School/company
        console.log("Filling school/company");
        fillField("school/company", data.schoolCompany || "");
        
        // Client contact details
        console.log("Filling contact details");
        fillField("customer best contact email", data.contactEmail || "");
        fillField("customer contact phone", data.contactPhone || "");
        
        // Venue
        console.log("Filling venue");
        fillField("venue", data.venue || "");
        
        // Times
        console.log("Filling times");
        fillField("start time", data.startTime || "");
        fillField("finish time", data.finishTime || "");
        
        // DJ hours
        console.log("Filling DJ hours");
        fillField("dj total hours", data.totalHours || "4");
        
        console.log("Form filling complete");
        return {success: true, message: "Form filled successfully"};
      } catch (error) {
        console.error("Error filling form:", error);
        return {success: false, message: error.message};
      }
      
      // Helper function to find form field by label text
      function fillField(labelText, value, isDate = false) {
        labelText = labelText.toLowerCase();
        console.log(`Attempting to fill field "${labelText}" with value "${value}"`);
        
        // Direct match via for attribute
        if (labelMap && labelMap[labelText]) {
          const el = document.getElementById(labelMap[labelText]);
          if (el) {
            console.log(`Found element by ID: ${labelMap[labelText]}`);
            setValueAndTriggerEvents(el, value, isDate);
            return true;
          }
        }
        
        // Find by nearby label text
        let found = false;
        
        // First try direct input identification
        inputs.forEach(input => {
          if (found) return;
          
          // Skip radio buttons
          if (input.type === 'radio') return;
          
          // Check input attributes for matches
          const placeholder = (input.placeholder || "").toLowerCase();
          const name = (input.name || "").toLowerCase();
          const id = (input.id || "").toLowerCase();
          
          if (placeholder.includes(labelText) || 
              name.includes(labelText) || 
              id.includes(labelText.replace(/[^a-z0-9]/g, ''))) {
            console.log(`Found input by attribute match: ${id || name}`);
            setValueAndTriggerEvents(input, value, isDate);
            found = true;
            return;
          }
          
          // Check for nearby text nodes
          const nearbyText = findNearbyLabel(input);
          if (nearbyText && nearbyText.toLowerCase().includes(labelText)) {
            console.log(`Found input by nearby text: "${nearbyText}"`);
            setValueAndTriggerEvents(input, value, isDate);
            found = true;
            return;
          }
        });
        
        if (!found) {
          console.warn(`Could not find field for "${labelText}"`);
        }
        
        return found;
      }
      
      function findNearbyLabel(element) {
        // Check if element has a label associated via for/id
        const id = element.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent.trim();
        }
        
        // Check for parent label
        let parent = element.parentElement;
        while (parent && parent.tagName !== 'BODY') {
          if (parent.tagName === 'LABEL') {
            return parent.textContent.trim();
          }
          
          // Check siblings for label-like elements
          const siblings = Array.from(parent.children);
          for (const sibling of siblings) {
            if (sibling === element) continue;
            
            if (sibling.tagName === 'LABEL' || 
                sibling.classList.contains('label') || 
                sibling.classList.contains('field-label')) {
              return sibling.textContent.trim();
            }
          }
          
          parent = parent.parentElement;
        }
        
        // Look for nearby text nodes within a reasonable distance
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let closestText = '';
        let closestDistance = Infinity;
        
        // Check text nodes nearby
        const textElements = document.querySelectorAll('label, div, span, p');
        textElements.forEach(el => {
          if (el.textContent.trim() === '') return;
          if (el.querySelector('input, select, textarea')) return; // Skip if contains form elements
          
          const elRect = el.getBoundingClientRect();
          const elCenterX = elRect.left + elRect.width / 2;
          const elCenterY = elRect.top + elRect.height / 2;
          
          // Calculate distance, weighing Y distance more (labels typically above/below inputs)
          const deltaX = centerX - elCenterX;
          const deltaY = (centerY - elCenterY) * 3; // Weight vertical distance more
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          
          if (distance < 200 && distance < closestDistance) { // 200px max distance
            closestDistance = distance;
            closestText = el.textContent.trim();
          }
        });
        
        return closestText;
      }
      
      function findRadioGroupByLabel(labelText) {
        labelText = labelText.toLowerCase();
        const radios = [];
        
        // Find all radio groups
        const radioInputs = document.querySelectorAll('input[type="radio"]');
        const radioGroups = {};
        
        radioInputs.forEach(radio => {
          const name = radio.name;
          if (!radioGroups[name]) {
            radioGroups[name] = [];
          }
          radioGroups[name].push(radio);
        });
        
        // Find group with matching label
        for (const [name, group] of Object.entries(radioGroups)) {
          // Check if any radio has a label matching the text
          let found = false;
          
          for (const radio of group) {
            const label = findNearbyLabel(radio);
            if (label && label.toLowerCase().includes(labelText)) {
              found = true;
              break;
            }
          }
          
          // Also check if the group's container has the label
          if (!found) {
            const container = findCommonAncestor(group);
            if (container) {
              const containerText = container.textContent.toLowerCase();
              if (containerText.includes(labelText)) {
                found = true;
              }
            }
          }
          
          if (found) {
            return group;
          }
        }
        
        return [];
      }
      
      function findCommonAncestor(elements) {
        if (elements.length === 0) return null;
        if (elements.length === 1) return elements[0].parentElement;
        
        let ancestor = elements[0].parentElement;
        while (ancestor) {
          let containsAll = true;
          for (let i = 1; i < elements.length; i++) {
            if (!ancestor.contains(elements[i])) {
              containsAll = false;
              break;
            }
          }
          
          if (containsAll) return ancestor;
          ancestor = ancestor.parentElement;
        }
        
        return null;
      }
      
      function selectRadioOption(labelText, value) {
        const radioGroup = findRadioGroupByLabel(labelText);
        console.log(`Found ${radioGroup.length} radio buttons for "${labelText}"`);
        
        if (radioGroup.length > 0) {
          for (const radio of radioGroup) {
            // Check radio value
            if (radio.value.toLowerCase() === value.toLowerCase()) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`Set radio to ${value}`);
              return true;
            }
            
            // Check label text
            const label = findNearbyLabel(radio);
            if (label && (label.toLowerCase() === value.toLowerCase() || 
                          label.toLowerCase().includes(value.toLowerCase()))) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`Set radio with label "${label}" to checked`);
              return true;
            }
          }
          
          // If no exact match, try Y/Yes and N/No matches
          if (value.toLowerCase() === 'y' || value.toLowerCase() === 'yes') {
            for (const radio of radioGroup) {
              const label = findNearbyLabel(radio);
              if ((radio.value === 'Y' || radio.value === 'Yes' || radio.value === 'yes') ||
                  (label && (label.includes('Y') || label.includes('Yes') || label.includes('yes')))) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`Set radio to Y/Yes option`);
                return true;
              }
            }
          } else if (value.toLowerCase() === 'n' || value.toLowerCase() === 'no') {
            for (const radio of radioGroup) {
              const label = findNearbyLabel(radio);
              if ((radio.value === 'N' || radio.value === 'No' || radio.value === 'no') ||
                  (label && (label.includes('N') || label.includes('No') || label.includes('no')))) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`Set radio to N/No option`);
                return true;
              }
            }
          }
        }
        
        console.warn(`Could not set radio option for "${labelText}" to "${value}"`);
        return false;
      }
      
      function setValueAndTriggerEvents(element, value, isDate) {
        if (element.tagName === 'SELECT') {
          for (let i = 0; i < element.options.length; i++) {
            if (element.options[i].text.toLowerCase().includes(value.toLowerCase())) {
              element.selectedIndex = i;
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }
        } else {
          // For date inputs, click it first to open the date picker
          if (isDate && element.type !== 'date') {
            element.click();
          }
          
          // Set the value and trigger events
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          // For date picker, add a slight pause and blur to ensure it updates
          if (isDate) {
            setTimeout(() => {
              element.blur();
            }, 100);
          }
        }
      }
      
      // Helper functions for filling form fields
      function fillInputByLabel(labelText, value) {
        try {
          // Try to find the label element
          const labels = Array.from(document.querySelectorAll('label')).filter(
            label => label.textContent.trim().includes(labelText)
          );
          
          let input;
          
          if (labels.length > 0) {
            // Get the associated input if label exists
            const label = labels[0];
            const forId = label.getAttribute('for');
            
            if (forId) {
              input = document.getElementById(forId);
            } else {
              input = label.querySelector('input, textarea, select');
            }
          } else {
            // Try to find by placeholder or nearby text
            const placeholderInput = Array.from(document.querySelectorAll('input, textarea')).find(
              el => el.placeholder && el.placeholder.includes(labelText)
            );
            
            if (placeholderInput) {
              input = placeholderInput;
            } else {
              // Look for text nodes containing the label text
              const textNodes = [];
              const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
              );
              
              let node;
              while ((node = walker.nextNode())) {
                if (node.nodeValue.trim().includes(labelText)) {
                  textNodes.push(node);
                }
              }
              
              // Find the closest input to the text node
              if (textNodes.length > 0) {
                let closestDistance = Infinity;
                let closestInput = null;
                
                textNodes.forEach(textNode => {
                  const inputs = document.querySelectorAll('input, textarea, select');
                  inputs.forEach(inp => {
                    const distance = getNodeDistance(textNode, inp);
                    if (distance < closestDistance) {
                      closestDistance = distance;
                      closestInput = inp;
                    }
                  });
                });
                
                if (closestInput) {
                  input = closestInput;
                }
              }
            }
          }
          
          if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          
          return false;
        } catch (e) {
          console.error(`Error filling input for "${labelText}":`, e);
          return false;
        }
      }
      
      function fillSelectByLabel(labelText, value) {
        try {
          // Find the select element similar to how we find input fields
          const labels = Array.from(document.querySelectorAll('label')).filter(
            label => label.textContent.trim().includes(labelText)
          );
          
          let select;
          
          if (labels.length > 0) {
            const label = labels[0];
            const forId = label.getAttribute('for');
            
            if (forId) {
              select = document.getElementById(forId);
            } else {
              select = label.querySelector('select');
            }
          } else {
            // Try to find by nearby text
            const textNodes = [];
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            let node;
            while ((node = walker.nextNode())) {
              if (node.nodeValue.trim().includes(labelText)) {
                textNodes.push(node);
              }
            }
            
            if (textNodes.length > 0) {
              let closestDistance = Infinity;
              let closestSelect = null;
              
              textNodes.forEach(textNode => {
                const selects = document.querySelectorAll('select');
                selects.forEach(sel => {
                  const distance = getNodeDistance(textNode, sel);
                  if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSelect = sel;
                  }
                });
              });
              
              if (closestSelect) {
                select = closestSelect;
              }
            }
          }
          
          if (select) {
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].text.includes(value)) {
                select.selectedIndex = i;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }
          }
          
          return false;
        } catch (e) {
          console.error(`Error filling select for "${labelText}":`, e);
          return false;
        }
      }
      
      function clickYesNoOption(labelText, value) {
        try {
          // Find the group of radio buttons or yes/no options
          const labels = Array.from(document.querySelectorAll('label, div, span')).filter(
            el => el.textContent.trim().includes(labelText)
          );
          
          if (labels.length > 0) {
            // Look for the parent container
            const container = findParentContainer(labels[0]);
            
            if (container) {
              // Find Y/N, Yes/No, or similar radio buttons
              const options = container.querySelectorAll('input[type="radio"]');
              
              // Find Y or Yes option
              const yesOption = Array.from(options).find(opt => {
                const label = document.querySelector(`label[for="${opt.id}"]`);
                const optionText = label ? label.textContent.trim() : '';
                return optionText === 'Y' || optionText === 'Yes' || optionText === 'yes' || opt.value === 'Y' || opt.value === 'Yes';
              });
              
              // Find N or No option
              const noOption = Array.from(options).find(opt => {
                const label = document.querySelector(`label[for="${opt.id}"]`);
                const optionText = label ? label.textContent.trim() : '';
                return optionText === 'N' || optionText === 'No' || optionText === 'no' || opt.value === 'N' || opt.value === 'No';
              });
              
              if (value && yesOption) {
                yesOption.checked = true;
                yesOption.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              } else if (!value && noOption) {
                noOption.checked = true;
                noOption.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }
          }
          
          return false;
        } catch (e) {
          console.error(`Error clicking option for "${labelText}":`, e);
          return false;
        }
      }
      
      function findParentContainer(element) {
        // Try to find a parent element that might contain the radio buttons
        let current = element;
        let depth = 0;
        const maxDepth = 5; // Limit search depth
        
        while (current && depth < maxDepth) {
          // Check if this parent contains radio buttons
          if (current.querySelectorAll('input[type="radio"]').length > 0) {
            return current;
          }
          
          current = current.parentElement;
          depth++;
        }
        
        // If no suitable parent found, return the parent element anyways
        return element.parentElement;
      }
      
      function getNodeDistance(node1, node2) {
        // Simple function to estimate visual distance between nodes
        const rect1 = getNodeRect(node1);
        const rect2 = getNodeRect(node2);
        
        const dx = rect1.left - rect2.left;
        const dy = rect1.top - rect2.top;
        
        return Math.sqrt(dx*dx + dy*dy);
      }
      
      function getNodeRect(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getBoundingClientRect();
        } else {
          return node.getBoundingClientRect();
        }
      }
    }