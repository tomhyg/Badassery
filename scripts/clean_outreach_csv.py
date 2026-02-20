import csv
import re
from urllib.parse import urlparse

def extract_podcast_id_from_url(url):
    """
    Extract iTunes podcast ID from Apple Podcasts URL
    Example: https://podcasts.apple.com/us/podcast/product-thinking/id1550800132 -> 1550800132
    """
    if not url:
        return None

    # Pattern: id followed by digits
    match = re.search(r'/id(\d+)', url)
    if match:
        return match.group(1)
    return None

def clean_show_name(show_name):
    """
    Remove prefixes like [1%], [5%], [10%] from show names
    Example: "[5%] Product Thinking" -> "Product Thinking"
    """
    if not show_name:
        return show_name

    # Remove [X%] prefix and trim
    cleaned = re.sub(r'^\[\d+%\]\s*', '', show_name)
    return cleaned.strip()

def parse_host_contact_info(contact_info):
    """
    Parse Host Contact Info field into structured data
    Returns dict with: linkedin, email, website
    """
    result = {
        'host_linkedin': '',
        'host_email': '',
        'host_website': ''
    }

    if not contact_info:
        return result

    # Extract LinkedIn
    linkedin_match = re.search(r'LinkedIn\s+(https://[^\s]+)', contact_info)
    if linkedin_match:
        result['host_linkedin'] = linkedin_match.group(1).strip()

    # Extract Email
    email_match = re.search(r'mailto:([^\s]+)', contact_info)
    if email_match:
        result['host_email'] = email_match.group(1).strip()

    # Extract Website
    website_match = re.search(r'Website\s+(https://[^\s]+)', contact_info)
    if website_match:
        result['host_website'] = website_match.group(1).strip()

    return result

def clean_outreach_csv(input_file, output_file):
    """
    Clean and enrich the outreach CSV file
    """
    with open(input_file, 'r', encoding='utf-8-sig') as f_in:
        reader = csv.DictReader(f_in)

        # Prepare output fieldnames (add new columns)
        fieldnames = reader.fieldnames.copy()

        # Add new columns after Show Name
        show_name_index = fieldnames.index('Show Name (from Show Name)')
        fieldnames.insert(show_name_index + 1, 'Show Name Clean')
        fieldnames.insert(show_name_index + 2, 'iTunes ID')

        # Add host contact columns after Host Contact Info
        host_info_index = fieldnames.index('Host Contact Info')
        fieldnames.insert(host_info_index + 1, 'Host LinkedIn')
        fieldnames.insert(host_info_index + 2, 'Host Email')
        fieldnames.insert(host_info_index + 3, 'Host Website')

        rows = []

        for row in reader:
            # Clean show name
            show_name_from_field = row.get('Show Name (from Show Name)', '')
            row['Show Name Clean'] = clean_show_name(show_name_from_field)

            # Extract iTunes ID
            show_link = row.get('Show link', '')
            row['iTunes ID'] = extract_podcast_id_from_url(show_link)

            # Parse host contact info
            host_contact_info = row.get('Host Contact Info', '')
            host_data = parse_host_contact_info(host_contact_info)
            row['Host LinkedIn'] = host_data['host_linkedin']
            row['Host Email'] = host_data['host_email']
            row['Host Website'] = host_data['host_website']

            rows.append(row)

    # Write cleaned CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ Cleaned CSV saved to: {output_file}")
    print(f"📊 Total rows processed: {len(rows)}")

    # Print sample of cleaned data
    if rows:
        print("\n📋 Sample of cleaned data (first 3 rows):")
        for i, row in enumerate(rows[:3], 1):
            print(f"\n--- Row {i} ---")
            print(f"Client: {row.get('Client', '')}")
            print(f"Show Name Original: {row.get('Show Name (from Show Name)', '')}")
            print(f"Show Name Clean: {row.get('Show Name Clean', '')}")
            print(f"iTunes ID: {row.get('iTunes ID', '')}")
            print(f"Host LinkedIn: {row.get('Host LinkedIn', '')}")
            print(f"Host Email: {row.get('Host Email', '')}")
            print(f"Host Website: {row.get('Host Website', '')}")

if __name__ == "__main__":
    input_file = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\outreach_final_2026_January-Grid view.csv"
    output_file = r"C:\Users\admin\OneDrive\Bureau\Dossier danielle\outreach_final_2026_January_CLEANED.csv"

    print("🔄 Starting CSV cleaning process...")
    clean_outreach_csv(input_file, output_file)
    print("\n✨ Done!")
