# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
  - **Monthly Report Filter Fix:** When filtering a specific employee, it still shows the information about all of the employees.
  - **Hide Other Employees on PayrollSummary.jsx Upon Filtering:** When filtering a specific employee, it does remove the calculations for the other employees, but keeps their names. - ***Last Priority!***
  - **Design of Popup in Specific Day:** Improve the design of the popup shown when clicking a specific date in the Dashboard. At the moment looks weird. - ***Last Priority!***
  - **Fix Top Row of the Table:** Become RTL to fix to the data. - פירוט הרישומים, דף שירותים
  - **Instructions:** Easy to understand explanations about functionality of the different, functions that are around the system. Not every function but the more complicated ones.
  - **System Version + Update Log Input:** Create a version to the system by known standard, show under the "מנהל מערכת" and input the functions created to the system in the Update Log.
  - **User-Friendly Startup:** Make it so upon startup, a loading window is opened and then the launcher. At the moment it takes a few seconds to launch.
  - **Current Page Signal:** Have a color/signal of sort to tell within which page we are.
  - **Deployment in Web Hosting:** Deploying under thepcrunners.com domain, think of an option of showing the domain portal.havat-tut.co.il for Havat Tut's portal.
  - **Vacation Days and Bonuses (UI & Logic):** Implementing the user interface and logic for managing vacation days and bonuses for all employee types (the database table `LeaveBalances` is ready).
  - **Check Possible Future Clash:** In TimeEntryForm.jsx there's   id: Math.random(), - does it mean that it randomly generate the ID? Does it make sure the ID doesn't already exist? What will happen if the ID exist? Will it fail or will it reroll?
  - **Time Entry Table:** Salary adjustments are no longer included when editing sessions from the table view.
  - **Time Entry Table:** Monthly totals use current rate history so same-day rate changes are reflected immediately.
  - **Time Entry Table:** Clicking a cell that contains only salary adjustments now opens a fresh hours entry instead of editing the adjustment.
  - **Initial Rate Start Date:** New employee rates now default to the employee's start date instead of today's date.
  - **Rate History Duplication:** Editing an employee only adds a new rate entry when the rate value changes.
    - **Same-Day Rate Update:** Fixed an issue where updating an employee's rate twice on the same day showed success but kept the old rate.
    - **Simultaneous Rate Edits:** Adjusted current-rate detection so editing historical rates and the current rate together creates a new entry.
    - **Duplicate Day Warning:** Prevented adding multiple rate changes for the same day and guided users to edit the existing entry instead.


## [2025-09-10]
- Fixed ChartsOverview to include hours and salary adjustments for hourly and instructor employees.
- Corrected PayrollSummary and ChartsOverview to derive session payments from rate history so non-global employees show accurate totals.
- Applied month-aware logic in ChartsOverview and PayrollSummary so global salaries are added only when non-adjustment work exists and extra adjustments within the same months are included.
- Resolved report calculations that ignored salary adjustments by counting adjustments separately from regular sessions.
- Unified report calculations with time-entry table logic so expected payroll totals for all employee types include adjustments and month-aware global salaries.

## [1.3.0] - 2025-09-09
 ## Added
  - **Table View and Ability to Edit** Added the ability to see in Table view and allowed making changes to existing רישומים.

## [1.2.1] - 2025-09-08
  ## Fixed
  - **Bug Fixes Regrading Reports**
  - **Search Bar in Emplyees Now Turn HE->EN/EN->HE Text**
  - **Change Log Now Scrollable**

## [1.2.0] - 2025-09-08

  ## Added
  - **QuickStats:** Hebrew tooltips for each metric; tooltip positioned top‑left inside the card.
  - **Reports:** Tooltip clarifies month‑aware rules (adjustments and global base).
  - **Reports:** Warning banner when selecting a partial month (explains month‑aware inclusion).
  - **Recent Activity:** Red badge “התאמה” for adjustment entries.
  - **Overview (Charts):** Instructor‑only pie aggregation (count vs time), service‑colored.

  ## Changed
  - **Overview (Payments by employee):** Hide inactive employees; add global base per months with activity in range.
  - **Overview (Monthly trend):** Uses the filter’s month span; includes hourly/global hours and instructor sessions; excludes inactive employees.
  - **Reports totals:** Month‑aware logic
  - **Global base:** add once per employee for each calendar month in range where they have any entry (even if the exact day is outside the from/to).
  - **Adjustments:** include if they fall in months covered by the filter; avoid double counting ones already in the filtered list.
  - **Payroll Summary:** Uses the same month‑aware logic as Reports so totals align.
  - **QuickStats payments:** Add global base only if the global employee has any entry in the current month.
  - **Reports defaults:** Local‑date formatting; “from” = 1st of current month (prevents timezone shifts).

  ## Fixed
  - ChartsOverview hook‑order error by moving hooks above early returns.
  - Implemented missing sessionsByType to prevent ReferenceError and render pie.
  - 31st‑of‑month edge cases handled via month‑aware rules.
  - Avoided duplicate counting of adjustments already present in the filtered range.
  - Replaced several garbled Hebrew labels with clear text.

## [1.1.0] - 2025-09-07

  ### Added
  - **Global Employee Type:** The system now supports a "Global" employee type for managing employees with a fixed monthly salary. The UI in the employee form dynamically adjusts to show "Monthly Salary" instead of "Hourly Rate".
  - **Leave Management Foundation:** A new `LeaveBalances` table has been added to the database schema. This provides the foundation for future features related to tracking vacation and sick days for all employees.
  - **Collapsible Instructor Rates:** In the new employee table view, instructors now have an expandable/collapsible section to view their detailed service rates, keeping the main interface clean and organized.
  - **"Expand/Collapse All" Functionality:** A button has been added to the employee list to expand or collapse all instructor rate details simultaneously, allowing for easier review and comparison.

  ### Changed
  - **Major Architectural Improvement: Centralized Rate History:** The rate management system has been completely refactored. The `current_rate` field has been removed from the `Employees` table. All employee rates (Hourly, Global, and Instructor-specific) are now managed exclusively in the `RateHistory` table (using a `NULL` `service_id` for non-instructor rates). This change is critical for ensuring perfect historical accuracy for all financial data.
  - **UI Overhaul: Employee Table View:** The employee list has been redesigned from a card-based layout to a more compact, professional, and scalable table view. This allows users to see many more employees at a glance and quickly access actions.
  - **UX Workflow Improvement:** The employee management page now defaults to showing "Active" employees first, streamlining the most common user workflow.
  - **UI Polish:** The design of the collapsible rate details section was refined over several iterations to be more compact, readable, and aesthetically pleasing.

  ### Fixed
  - Resolved an issue where the `collapsible` component was not installed, causing the application to crash.
  - Fixed a missing `useState` import in the `EmployeeList` component.
  - Corrected a JSX syntax error in a comment that prevented compilation.

## [2025-09-06] - Desktop App & UX Refinements

This release finalizes the MVP by packaging the application for desktop use with Electron and adds several key user experience (UX) and quality-of-life improvements based on user feedback.

  ### Added
  - **Desktop Application (Electron):** The entire React application has been wrapped in Electron to create a standalone desktop app. This includes a custom-designed launcher (`launcher.html`) that provides options to open the app in its own window or in the user's default browser.
  - **Calendar Date Picker:** The dashboard calendar now includes a user-friendly dropdown picker for quickly navigating to any specific month and year, alongside the existing arrow and "Today" buttons.
  - **Specific File to Host API Credentials:** .env in root.

  ### Changed
  - **Launcher Logic:** The Electron main process (`electron.cjs`) was refactored to handle different launch modes (app window vs. external browser) and to correctly manage the application lifecycle.
  - **Refined Calendar UI:** The calendar header was redesigned to seamlessly integrate the new month/year pickers without compromising the existing clean layout.
  - **Path of "release" Folder** Having the release folder within the project's folder created issues uploading to GitHub.
  - **Hourly Rate for Instructos:** Removed.

  ### Fixed
  - **Launcher UI:** Fixed several design issues in the launcher, including button colors, layout, and alignment to ensure a professional and polished first impression.
  - **Launcher Stability:** Resolved an issue where the "Restart" function was unreliable by simplifying the launcher's options to "Open App" and "Open in Browser", providing a more robust and predictable user experience.
  - **Excel Output and Sorting by Date in File**

## [2025-09-05] - Infrastructure Migration & Feature Enhancement

This release marks a major migration from the initial low-code platform to a self-hosted, robust infrastructure using Supabase and React. It also introduces significant feature enhancements for dynamic rate and service management.

  ### Added
  - **Dynamic Service Management:** Created a new "Services" page allowing administrators to dynamically add, edit, and manage different types of instructor sessions (e.g., "30-min session", "45-min per student").
  - **Dynamic Rate Management:** Refactored the employee management system to support dynamic rates. Administrators can now set a unique rate for each instructor for each specific service.
  - **Multi-Entry Time Logging:** The "Time Entry" form was completely redesigned to support adding multiple work sessions at once, significantly improving workflow efficiency for administrators.
  - **Smart UX for Time Entry:** Implemented an `AlertDialog` to warn users when switching between different employee types (`hourly` vs. `instructor`), preventing accidental data loss while preserving relevant information.
  - **Drill-Down in Payroll Report:** The main payroll report in the "Reports" page now features an interactive drill-down view. Users can expand an instructor's summary row to see a detailed breakdown of their work by service type.

  ### Changed
  - **Backend Migration:** Migrated the entire backend logic and database from the Base44 low-code platform to **Supabase** (PostgreSQL).
  - **Frontend Refactoring:** Refactored all page and component files to use the Supabase client for all data operations (CRUD), replacing the platform-specific data access methods.
  - **Refined Payroll Report UI:** Redesigned the payroll summary table to be cleaner and more context-aware. It now displays relevant columns based on employee type and hides irrelevant data (e.g., hourly rate for instructors).
  - **Improved Data Calculation:** Corrected and enhanced data aggregation logic across all reports (`PayrollSummary`, `Reports` page totals) to accurately calculate total hours, including estimated hours for instructor sessions based on service duration.

  ### Fixed
  - **Rate History Logic:** Corrected the database schema and application logic for `RateHistory` to properly store a historical log of rate changes, ensuring retroactive payroll calculations are always accurate. This was achieved by implementing a composite unique constraint (`employee_id`, `service_id`, `effective_date`) and using `upsert` for idempotent operations.
  - **Component State Synchronization:** Resolved multiple critical bugs related to stale state, ensuring forms and reports always display the most current data after an update (e.g., employee rates in `EmployeeForm`, recent sessions in `Dashboard`).
  - **Data Fetching & Sorting Logic:** Refactored data fetching queries. The Dashboard's "Recent Activity" now sorts by creation time (`created_at`) for true "last-in" view, while other reports sort chronologically by `date` for logical consistency.
  - **Cross-Component Unification:** Refactored `RecentActivity` and `RecentEntries` into a single, reusable component, adhering to the DRY principle.
  - **Dynamic Color System:** Implemented a centralized color management system (`colorUtils.js`) and integrated it into the database `Services` table, allowing for dynamic, consistent, and user-configurable colors for different service types across all reports.
  - **Numerous UI/UX Fixes:**
    - RTL Layout Correction: Fixed CSS for the `Switch` component to ensure correct behavior in a right-to-left layout.
    - Restored and improved styling for summary cards and badges in the "Reports" page.
    - Corrected table header alignment.
    - Improved layout and spacing in the multi-entry time form for better readability.
    - Resolved all `unique key` prop warnings in React lists.

## [2025-09-05]
- User-facing changelog modal with blurred background
- Sidebar button for changelog
- Calendar popover redesign and bug fixes
- Month navigation restored
- Debug window removed
- Code cleanup and integration fixes
- Connected the project to GitHub

## [2025-09-04]
- Refactored calendar popover logic to use React portal for correct stacking and positioning.
- Fixed popover anchor and z-index issues.
- Improved popover appearance and stacking context.
- Cleaned up popover code and removed duplicate definitions.
- Validated dashboard and calendar integration.
- General UI/UX improvements for dashboard and calendar.
